import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { In, Repository } from 'typeorm';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentEntity } from './entities/document.entity';
import { DocumentIngestionJobEntity } from './entities/document-ingestion-job.entity';
import {
  DocumentContent,
  DocumentContentDocument,
} from './schemas/document-content.schema';
import { DocumentGraphTaskService } from './graph/document-graph-task.service';

@Injectable()
export class DocumentCatalogService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectModel(DocumentContent.name)
    private readonly contents: Model<DocumentContentDocument>,
    @InjectRepository(DocumentIngestionJobEntity)
    private readonly jobs: Repository<DocumentIngestionJobEntity>,
    private readonly graphTasks?: DocumentGraphTaskService,
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
    const datasetMap = new Map<string, { datasetId: string; datasetName: string }>();
    for (const raw of raws) {
      const docId = String(raw.doc_id);
      if (raw.datasetId && !datasetMap.has(docId)) {
        datasetMap.set(docId, { datasetId: String(raw.datasetId), datasetName: raw.datasetName ?? '' });
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
      items: await Promise.all(items.map(async (item) => {
        const job = latestJobs.get(item.id);
        const graph = this.graphTasks
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
      })),
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
            ((Date.now() - job.stageStartedAt.getTime()) / completed) *
              (total - completed) /
              1000,
          )
        : null,
  };
}
