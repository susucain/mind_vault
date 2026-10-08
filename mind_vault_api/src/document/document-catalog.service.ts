import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { In, Repository } from 'typeorm';
import { QueryDocumentDto } from './dto/query-document.dto';
import { QueryDocumentSectionsDto } from './dto/query-document-sections.dto';
import { DocumentEntity } from './entities/document.entity';
import { DocumentIngestionJobEntity } from './entities/document-ingestion-job.entity';
import {
  DocumentContent,
  DocumentContentDocument,
} from './schemas/document-content.schema';
import { DocumentGraphTaskService } from './graph/document-graph-task.service';
import { DocumentLocator, ParsedSection } from './parser/parsed-document';
import { RustfsService } from '../storage/rustfs.service';

/** 单个正文块的目标字符上限，超过的章节会按段落边界切分为多块 */
const SECTION_CHAR_BUDGET = 2000;

/**
 * 只读资产白名单：仅允许正文中引用的对象前缀。
 * 资产 key 由解析阶段写入正文，形如 `documents/{ownerId}/{documentId}/…`（A1），
 * 不接受任意对象读取。
 */
const ASSET_KEY_PREFIX = 'documents/';

/**
 * 过渡期兼容：A1 之前的存量资产无 owner 段（`pdf-images/…`），
 * 切生产 OSS 前由 M7 一次性搬迁，搬迁完成后删除本兼容分支。
 */
const LEGACY_ASSET_KEY_PREFIXES = ['pdf-images/'];

const ASSET_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

@Injectable()
export class DocumentCatalogService {
  private readonly logger = new Logger(DocumentCatalogService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectModel(DocumentContent.name)
    private readonly contents: Model<DocumentContentDocument>,
    @InjectRepository(DocumentIngestionJobEntity)
    private readonly jobs: Repository<DocumentIngestionJobEntity>,
    private readonly graphTasks?: DocumentGraphTaskService,
    private readonly storage?: RustfsService,
  ) {}

  async findAll(ownerId: string, query: QueryDocumentDto) {
    const qb = this.documents
      .createQueryBuilder('doc')
      .leftJoin(
        'kh_dataset_document',
        'datasetDocument',
        'datasetDocument.document_id = doc.id AND datasetDocument.owner_id = :ownerId',
        { ownerId },
      )
      .leftJoin(
        'kh_dataset',
        'dataset',
        'dataset.id = datasetDocument.dataset_id AND dataset.owner_id = :ownerId',
        { ownerId },
      )
      .addSelect('datasetDocument.dataset_id', 'datasetId')
      .addSelect('dataset.name', 'datasetName')
      .where('doc.owner_id = :ownerId', { ownerId })
      .andWhere('doc.deleted = false');
    if (query.datasetId) {
      qb.andWhere('datasetDocument.dataset_id = :datasetId', {
        datasetId: query.datasetId,
      });
    }
    if (query.title) {
      qb.andWhere('doc.title ILIKE :title', { title: `%${query.title}%` });
    }
    qb.orderBy('doc.created_at', 'DESC')
      .skip(((query.page ?? 1) - 1) * (query.pageSize ?? 20))
      .take(query.pageSize ?? 20);
    const { entities, raw: raws } = await qb.getRawAndEntities();
    const total = await qb.getCount();
    const datasetMap = new Map<
      string,
      { datasetId: string; datasetName: string }
    >();
    for (const raw of raws) {
      const docId = String(raw.doc_id);
      if (raw.datasetId && !datasetMap.has(docId)) {
        datasetMap.set(docId, {
          datasetId: String(raw.datasetId),
          datasetName: raw.datasetName ?? '',
        });
      }
    }
    const items = entities.map((entity) => {
      const datasetInfo = datasetMap.get(entity.id);
      return datasetInfo ? { ...entity, ...datasetInfo } : entity;
    });
    const jobs = items.length
      ? await this.jobs.find({
          where: {
            ownerId,
            documentId: In(items.map((item) => item.id)),
          },
          order: { createdAt: 'DESC' },
        })
      : [];
    const latestJobs = new Map<string, DocumentIngestionJobEntity>();
    for (const job of jobs) {
      if (!latestJobs.has(job.documentId)) {
        latestJobs.set(job.documentId, job);
      }
    }
    return {
      items: await Promise.all(
        items.map(async (item) => {
          const job = latestJobs.get(item.id);
          const graph =
            item.graphEnabled && this.graphTasks
              ? await this.graphTasks.getProgress(
                  ownerId,
                  item.id,
                  job?.documentVersion,
                )
              : null;
          return {
            ...item,
            ingestionStatus: job?.status ?? null,
            ingestionStage: job?.currentStage ?? null,
            ingestionErrorMessage: job?.errorMessage ?? null,
            ingestionProgress: job ? progressOf(job) : null,
            graph,
          };
        }),
      ),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async findOne(ownerId: string, id: string) {
    const document = await this.documents.findOne({
      where: { id, ownerId, deleted: false },
    });
    if (!document) throw new NotFoundException(`Document ${id} not found`);
    const content = await this.contents
      .findOne({ documentId: id, deleted: false })
      .lean();
    return {
      ...document,
      content: content?.content ?? '',
      sections: content?.sections ?? [],
      pageCount: content?.pageCount ?? 0,
    };
  }

  async findOutline(ownerId: string, id: string) {
    const { document, content } = await this.loadDocument(ownerId, id);
    const blocks = buildBlocks(content?.sections ?? [], content?.content ?? '');
    const sections: Array<{
      sectionId: string;
      heading?: string;
      order: number;
      locator: DocumentLocator;
    }> = [];
    const seen = new Set<string>();
    for (const block of blocks) {
      if (seen.has(block.sectionId)) continue;
      seen.add(block.sectionId);
      sections.push({
        sectionId: block.sectionId,
        heading: block.heading,
        order: block.order,
        locator: block.locator,
      });
    }
    return {
      documentId: id,
      title: document.title,
      pageCount: content?.pageCount ?? 0,
      totalSections: sections.length,
      sections,
    };
  }

  async findSections(
    ownerId: string,
    id: string,
    query: QueryDocumentSectionsDto,
  ) {
    const { content } = await this.loadDocument(ownerId, id);
    const blocks = buildBlocks(content?.sections ?? [], content?.content ?? '');
    const limit = query.limit ?? 10;
    const startIndex = query.cursor === undefined ? 0 : query.cursor + 1;
    const items = blocks.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + items.length < blocks.length
        ? items[items.length - 1].order
        : null;
    return { items, nextCursor, total: blocks.length };
  }

  /**
   * 读取正文引用的只读资产（如 PDF 抽出的插图），key 即正文 `![](...)` 中的路径。
   *
   * A1 隔离：新 key 形如 `documents/{ownerId}/{documentId}/…`，解析 owner 段与
   * 当前用户比对，不匹配返回 404（不泄露对象是否存在）。存量无 owner 段的旧 key
   * 在过渡期仅要求登录并记 warn，待 M7 搬迁后删除该分支。
   */
  async readAsset(ownerId: string, key: string) {
    const normalized = key?.replace(/^\/+/, '') ?? '';
    if (!isAllowedAssetKey(normalized) || !this.storage?.isEnabled()) {
      throw new NotFoundException(`Asset ${key} not found`);
    }
    const assetOwner = assetOwnerSegment(normalized);
    if (assetOwner) {
      if (assetOwner !== ownerId) {
        throw new NotFoundException(`Asset ${key} not found`);
      }
    } else {
      this.logger.warn(
        `读取无 owner 段的存量资产（待 M7 搬迁后移除兼容分支）：key=${normalized}`,
      );
    }
    let body: Buffer;
    try {
      body = await this.storage.downloadBytes(normalized);
    } catch {
      throw new NotFoundException(`Asset ${key} not found`);
    }
    return { body, contentType: assetContentType(normalized) };
  }

  private async loadDocument(ownerId: string, id: string) {
    const document = await this.documents.findOne({
      where: { id, ownerId, deleted: false },
    });
    if (!document) throw new NotFoundException(`Document ${id} not found`);
    const content = await this.contents
      .findOne({ documentId: id, deleted: false })
      .lean();
    return { document, content };
  }

  async datasetStats(ownerId: string, datasetId: string) {
    const count = async (status?: number) => {
      const qb = this.documents
        .createQueryBuilder('doc')
        .innerJoin(
          'kh_dataset_document',
          'datasetDocument',
          'datasetDocument.document_id = doc.id AND datasetDocument.owner_id = :ownerId',
          { ownerId },
        )
        .where('doc.owner_id = :ownerId', { ownerId })
        .andWhere('doc.deleted = false')
        .andWhere('datasetDocument.dataset_id = :datasetId', { datasetId });
      if (status !== undefined) qb.andWhere('doc.status = :status', { status });
      return qb.getCount();
    };
    const [total, available, processing] = await Promise.all([
      count(),
      count(1),
      count(0),
    ]);
    return { total, available, processing };
  }
}

/** 仅放行白名单前缀，并挡住路径穿越与绝对路径。 */
function isAllowedAssetKey(key: string): boolean {
  if (!key || key.includes('..') || key.includes('\\') || key.includes('//')) {
    return false;
  }
  return (
    key.startsWith(ASSET_KEY_PREFIX) ||
    LEGACY_ASSET_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/**
 * 取 `documents/{ownerId}/…` 中的 owner 段；
 * 非该前缀（含过渡期的旧 key）返回 undefined，由调用方走「仅要求登录」分支。
 */
function assetOwnerSegment(key: string): string | undefined {
  if (!key.startsWith(ASSET_KEY_PREFIX)) return undefined;
  return key.slice(ASSET_KEY_PREFIX.length).split('/')[0] || undefined;
}

function assetContentType(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return ASSET_CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

function progressOf(job: DocumentIngestionJobEntity) {
  const completed = job.stageCompleted ?? 0;
  const total = job.stageTotal ?? 0;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    estimatedRemainingSeconds:
      job.stageStartedAt && completed > 0 && total > completed
        ? Math.ceil(
            (((Date.now() - job.stageStartedAt.getTime()) / completed) *
              (total - completed)) /
              1000,
          )
        : null,
  };
}

export interface DocumentBlock {
  sectionId: string;
  heading?: string;
  text: string;
  order: number;
  locator: DocumentLocator;
}

/**
 * 将章节展开为按字符预算切分的正文块，`order` 为块的顺序下标。
 *
 * 章节通常来自解析器（PDF 按页、Markdown 按标题），但无标题的 Markdown 会把
 * 整篇塞进单节，故超长章节按段落边界继续切分，避免整篇下发；`sections` 为空时
 * 退化为按全文切分。
 */
function buildBlocks(
  sections: ParsedSection[],
  content: string,
  budget = SECTION_CHAR_BUDGET,
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const source = sections.length
    ? [...sections].sort((a, b) => a.order - b.order)
    : [];
  if (source.length === 0) {
    const parts = splitByBudget(content.trim(), budget);
    parts.forEach((text, index) => {
      const sectionId = `section_${String(index + 1).padStart(4, '0')}`;
      blocks.push({ sectionId, text, order: index, locator: {} });
    });
    return blocks;
  }
  for (const section of source) {
    const parts = splitByBudget(section.text, budget);
    parts.forEach((text, partIndex) => {
      blocks.push({
        sectionId: section.sectionId,
        heading: partIndex === 0 ? section.heading : undefined,
        text,
        order: blocks.length,
        locator: section.locator ?? {},
      });
    });
  }
  return blocks;
}

/** 按段落/行边界把文本切成不超过 budget 的片段，尽量不切断段落 */
function splitByBudget(text: string, budget: number): string[] {
  if (text.length <= budget) return text ? [text] : [];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > budget) {
    let cut = remaining.lastIndexOf('\n\n', budget);
    if (cut <= 0) cut = remaining.lastIndexOf('\n', budget);
    if (cut <= 0) cut = budget;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}
