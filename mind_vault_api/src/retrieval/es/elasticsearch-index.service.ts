import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentChunk } from '../../document/chunking/document-chunk';
import {
  HighlightSegment,
  RetrievalHit,
  RetrievalPage,
} from '../retrieval-hit';
import {
  CHUNK_INDEX_ALIAS,
  CHUNK_INDEX_VERSION,
  chunkIndexMapping,
  chunkIndexName,
  chunkMappingVersion,
  readMappingVersion,
} from './chunk-index-mapping';

export const ELASTICSEARCH_CLIENT = Symbol('ELASTICSEARCH_CLIENT');

/** 高亮标记用不可见控制字符，避免与正文冲突，且服务端会切分为分段而非返回 HTML */
const HIGHLIGHT_PRE = '\u0002';
const HIGHLIGHT_POST = '\u0003';

/** kNN 的 k 上限：k 即返回上限，超过后无法继续深翻页 */
export const VECTOR_K_CAP = 100;

/** `getByChunkIds` 单次查询的 terms 分片大小（I6）：超出则并发分片后合并 */
export const CHUNK_ID_BATCH_SIZE = 100;

/** bulk 中失败条目的明细（I2）：便于定位是 mapping 冲突还是单条超长 */
export interface BulkIndexFailure {
  chunkId: string;
  reason: string;
}

/** bulk 部分失败时抛出，携带逐条失败原因，而不是笼统的「索引失败」 */
export class BulkIndexError extends Error {
  constructor(readonly failures: BulkIndexFailure[]) {
    super(`Elasticsearch bulk 索引失败: ${failures.length} 条`);
    this.name = 'BulkIndexError';
  }
}

interface ElasticsearchLike {
  indices: {
    exists(input: { index: string }): Promise<boolean>;
    create(input: unknown): Promise<unknown>;
    delete(input: { index: string }): Promise<unknown>;
    getAlias(input: { name: string }): Promise<Record<string, unknown>>;
    getMapping(input: { index: string }): Promise<Record<string, unknown>>;
    updateAliases(input: { actions: unknown[] }): Promise<unknown>;
    refresh(input: { index: string }): Promise<unknown>;
  };
  bulk(input: { refresh: string | boolean; operations: unknown[] }): Promise<{
    errors: boolean;
    items?: Array<
      Record<string, { _id?: string; error?: { reason?: string } }>
    >;
  }>;
  search(input: unknown): Promise<{
    hits: {
      total?: { value: number; relation?: string };
      hits: Array<{
        _id: string;
        _score?: number;
        _source: Record<string, unknown>;
        highlight?: Record<string, string[]>;
      }>;
    };
  }>;
  deleteByQuery(input: unknown): Promise<unknown>;
  updateByQuery(input: unknown): Promise<unknown>;
}

@Injectable()
export class ElasticsearchIndexService {
  private readonly logger = new Logger(ElasticsearchIndexService.name);
  /** 读写统一走别名（I1）；物理索引按版本号后缀，切换由 `npm run es:migrate` 负责 */
  private readonly indexName = CHUNK_INDEX_ALIAS;

  constructor(
    @Inject(ELASTICSEARCH_CLIENT)
    private readonly client: ElasticsearchLike,
    private readonly config: ConfigService,
  ) {}

  /**
   * 索引自检（I1）：别名缺失时引导建当前版本索引；别名已存在时读取其后端索引的
   * `_meta.mappingVersion` 与代码期望指纹比对，不一致只告警——**不在启动时自动建/切**，
   * 避免多副本竞争，切换交给显式脚本。
   */
  async ensureIndex() {
    const dimensions = this.embeddingDimensions();
    const exists = await this.client.indices.exists({ index: this.indexName });
    if (!exists) {
      await this.createVersionIndex(CHUNK_INDEX_VERSION, dimensions);
      await this.pointAliasTo(CHUNK_INDEX_VERSION);
      return;
    }
    try {
      const mapping = await this.client.indices.getMapping({
        index: this.indexName,
      });
      const actual = readMappingVersion(mapping);
      const expected = chunkMappingVersion(dimensions);
      if (actual !== expected) {
        this.logger.warn(
          `ES mapping 版本不一致（实际=${actual ?? '未知'} 期望=${expected}），如需演进请运行 npm run es:migrate`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `ES mapping 版本比对失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** 建（或复用）某版本的物理索引（不含别名）；仅引导与 es:migrate 使用 */
  async createVersionIndex(
    version: number,
    dimensions = this.embeddingDimensions(),
  ): Promise<string> {
    const index = chunkIndexName(version);
    const exists = await this.client.indices.exists({ index });
    if (!exists) {
      await this.client.indices.create({
        index,
        mappings: {
          _meta: { mappingVersion: chunkMappingVersion(dimensions) },
          ...chunkIndexMapping(dimensions),
        },
      });
    }
    return index;
  }

  /** 把读写别名整体指向目标版本（先摘后挂，避免写入别名同时指向多个索引） */
  async pointAliasTo(version: number): Promise<void> {
    // 首次引导时别名并不存在，此时发 remove 会让整条 updateAliases 以
    // `aliases_not_found_exception` 失败（`must_exist:false` 也无效），add 永远落不下去，
    // 所以只在别名确实存在时才「先摘」。
    const actions: unknown[] = [];
    if (await this.aliasExists()) {
      actions.push({ remove: { index: '*', alias: this.indexName } });
    }
    actions.push({
      add: { index: chunkIndexName(version), alias: this.indexName },
    });
    await this.client.indices.updateAliases({ actions });
  }

  /** 别名是否存在（getAlias 在缺失时抛 404，按「不存在」处理） */
  private async aliasExists(): Promise<boolean> {
    try {
      await this.client.indices.getAlias({ name: this.indexName });
      return true;
    } catch {
      return false;
    }
  }

  /** 删除某个物理版本索引（保留/回收旧版本时使用） */
  async deleteVersionIndex(version: number): Promise<void> {
    await this.client.indices.delete({ index: chunkIndexName(version) });
  }

  /** 解析并发量索引名，供运维脚本读取当前指向 */
  get aliasName(): string {
    return this.indexName;
  }

  /**
   * 显式刷新（I2）：写入收敛为 `refresh: false` 后，由 worker 在整份文档写完后调用一次，
   * 检索侧只关心「文档级可见」。
   */
  async refresh(): Promise<void> {
    await this.client.indices.refresh({ index: this.indexName });
  }

  async indexChunks(chunks: DocumentChunk[]) {
    if (chunks.length === 0) return;
    await this.ensureIndex();
    const operations = chunks.flatMap((chunk) => [
      {
        index: {
          _index: this.indexName,
          _id: chunk.chunkId,
        },
      },
      {
        chunkId: chunk.chunkId,
        parentId: chunk.parentId,
        ownerId: chunk.ownerId,
        documentId: chunk.documentId,
        datasetIds: chunk.datasetIds ?? [],
        documentVersion: chunk.documentVersion,
        deleted: false,
        sectionId: chunk.sectionId,
        chunkOrder: chunk.chunkOrder,
        titlePath: chunk.titlePath,
        titleKeyword: chunk.titlePath.join(' / '),
        text: chunk.text,
        parentContext: chunk.parentContext,
        locator: chunk.locator,
        embedding: chunk.embedding,
        updatedAt: new Date().toISOString(),
      },
    ]);
    const result = await this.client.bulk({
      // 刷新由调用方在整份文档写完后显式触发，避免每批都等一次 flush
      refresh: false,
      operations,
    });
    if (result.errors) {
      throw new BulkIndexError(extractBulkFailures(result.items));
    }
  }

  async keywordSearch(input: {
    ownerId: string;
    query: string;
    datasetIds?: string[];
    topK?: number;
    page?: number;
    pageSize?: number;
    sort?: 'relevance' | 'recent';
    from?: string;
    to?: string;
    highlight?: boolean;
  }): Promise<RetrievalPage> {
    const paginated = input.page !== undefined && input.pageSize !== undefined;
    const size = paginated ? input.pageSize! : (input.topK ?? 30);
    const offset = paginated ? (input.page! - 1) * input.pageSize! : 0;
    const filters = this.filters(input.ownerId, input.datasetIds);
    const range = this.rangeFilter(input.from, input.to);
    if (range) filters.push(range);
    const result = await this.client.search({
      index: this.indexName,
      size,
      ...(offset > 0 ? { from: offset } : {}),
      ...(paginated ? { track_total_hits: true } : {}),
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: input.query,
                fields: ['titlePath^3', 'text'],
              },
            },
          ],
          // titleKeyword 是 keyword 不分词，单独用 term 做标题精确命中加分
          should: [
            { term: { titleKeyword: { value: input.query, boost: 5 } } },
          ],
          filter: filters,
        },
      },
      ...(input.sort === 'recent'
        ? { sort: [{ updatedAt: { order: 'desc' } }] }
        : {}),
      ...(input.highlight ? { highlight: this.highlightSpec() } : {}),
    });
    return {
      hits: this.toHits(result, 'keyword'),
      total: result.hits.total?.value ?? result.hits.hits.length,
      truncated: false,
    };
  }

  async vectorSearch(input: {
    ownerId: string;
    vector: number[];
    datasetIds?: string[];
    topK?: number;
    page?: number;
    pageSize?: number;
    sort?: 'relevance' | 'recent';
    from?: string;
    to?: string;
  }): Promise<RetrievalPage> {
    const paginated = input.page !== undefined && input.pageSize !== undefined;
    const offset = paginated ? (input.page! - 1) * input.pageSize! : 0;
    // 多取 1 条用于探测「是否还有下一页」；kNN 没有 total，k 即返回上限
    const topK = paginated
      ? Math.min(offset + input.pageSize! + 1, VECTOR_K_CAP)
      : (input.topK ?? 30);
    const filters = this.filters(input.ownerId, input.datasetIds);
    const range = this.rangeFilter(input.from, input.to);
    if (range) filters.push(range);
    const result = await this.client.search({
      index: this.indexName,
      knn: {
        field: 'embedding',
        query_vector: input.vector,
        k: topK,
        num_candidates: Math.max(topK * 3, 100),
        filter: filters,
      },
    });
    // kNN 不支持与 sort 组合，按时间排序只能在已召回集合内本地进行
    const all =
      input.sort === 'recent'
        ? sortByUpdatedAtDesc(this.toHits(result, 'vector'))
        : this.toHits(result, 'vector');
    const hits = paginated ? all.slice(offset, offset + input.pageSize!) : all;
    return {
      hits,
      total: all.length,
      // 只有「k 被上限截断」且「确实召满上限」时才意味着无法继续深翻页
      truncated:
        paginated && topK >= VECTOR_K_CAP && all.length >= VECTOR_K_CAP,
    };
  }

  /**
   * 按 chunkId 批量回捞（I6）：单次 `size` 上限 100，超出部分过去会**静默丢失**
   * 且无法区分「没有这段」与「没查」。改为按 `CHUNK_ID_BATCH_SIZE` 分片并发查询后合并，
   * 并在返回体暴露 `requestedCount / returnedCount` 供观测覆盖率。
   */
  async getByChunkIds(input: {
    ownerId: string;
    chunkIds: string[];
    datasetIds?: string[];
  }): Promise<{
    hits: RetrievalHit[];
    requestedCount: number;
    returnedCount: number;
  }> {
    const unique = [...new Set(input.chunkIds.filter(Boolean))];
    if (unique.length === 0) {
      return { hits: [], requestedCount: 0, returnedCount: 0 };
    }
    const batches: string[][] = [];
    for (let index = 0; index < unique.length; index += CHUNK_ID_BATCH_SIZE) {
      batches.push(unique.slice(index, index + CHUNK_ID_BATCH_SIZE));
    }
    const pages = await Promise.all(
      batches.map((batch) =>
        this.client.search({
          index: this.indexName,
          size: batch.length,
          query: {
            bool: {
              filter: [
                ...this.filters(input.ownerId, input.datasetIds),
                { terms: { chunkId: batch } },
              ],
            },
          },
        }),
      ),
    );
    const hits = pages.flatMap((page) => this.toHits(page, 'graph'));
    return { hits, requestedCount: unique.length, returnedCount: hits.length };
  }

  /**
   * 批量判断 chunkId 是否仍存在于索引（K6 引用降级用）。
   * 分片逻辑收敛在 `getByChunkIds`（I6），这里只关心命中的 chunkId 集合。
   */
  async existingChunkIds(
    ownerId: string,
    chunkIds: string[],
  ): Promise<Set<string>> {
    const { hits } = await this.getByChunkIds({ ownerId, chunkIds });
    return new Set(hits.map((hit) => hit.chunkId));
  }

  async deleteByDocument(ownerId: string, documentId: string) {
    return this.client.deleteByQuery({
      index: this.indexName,
      conflicts: 'proceed',
      query: {
        bool: {
          filter: [{ term: { ownerId } }, { term: { documentId } }],
        },
      },
      refresh: true,
    });
  }

  async markDocumentDeleted(ownerId: string, documentId: string) {
    return this.client.updateByQuery({
      index: this.indexName,
      conflicts: 'proceed',
      refresh: true,
      script: {
        lang: 'painless',
        source: 'ctx._source.deleted = true',
      },
      query: {
        bool: {
          filter: [{ term: { ownerId } }, { term: { documentId } }],
        },
      },
    });
  }

  private embeddingDimensions(): number {
    const configured =
      this.config.get<string | number>('EMBEDDING_DIMENSION') ?? 1024;
    const dimensions = Number(configured);
    if (!Number.isInteger(dimensions) || dimensions < 1) {
      throw new Error(`无效的 Embedding 维度: ${String(configured)}`);
    }
    return dimensions;
  }

  private filters(ownerId: string, datasetIds?: string[]) {
    const filters: unknown[] = [
      { term: { ownerId } },
      { bool: { must_not: { term: { deleted: true } } } },
    ];
    if (datasetIds?.length) {
      filters.push({ terms: { datasetIds } });
    }
    return filters;
  }

  private rangeFilter(from?: string, to?: string) {
    if (!from && !to) return null;
    return {
      range: {
        updatedAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      },
    };
  }

  private highlightSpec() {
    return {
      pre_tags: [HIGHLIGHT_PRE],
      post_tags: [HIGHLIGHT_POST],
      fields: {
        // I4：chunk 长 1600 字时命中常不在第一个片段，多取几片再挑含命中的那片
        text: { fragment_size: 240, number_of_fragments: 3 },
      },
    };
  }

  private toHits(
    result: {
      hits: {
        hits: Array<{
          _id: string;
          _score?: number;
          _source: Record<string, unknown>;
          highlight?: Record<string, string[]>;
        }>;
      };
    },
    source: 'keyword' | 'vector' | 'graph',
  ): RetrievalHit[] {
    return result.hits.hits.map((hit) => ({
      chunkId: stringValue(hit._source.chunkId, hit._id),
      documentId: stringValue(hit._source.documentId),
      text: stringValue(hit._source.text),
      parentContext: stringValue(hit._source.parentContext),
      locator: objectValue(hit._source.locator),
      titlePath: stringArray(hit._source.titlePath),
      datasetIds: stringArray(hit._source.datasetIds),
      highlight: splitHighlight(pickHighlightFragment(hit.highlight?.text)),
      updatedAt: optionalString(hit._source.updatedAt),
      score: hit._score ?? 0,
      sources: [source],
    }));
  }
}

/**
 * 从多个高亮片段里挑一个用于展示（I4）：优先取「含命中标记」的那片，
 * 全部都没标记时退回第一片；避免命中落在后段片段时引用卡片看不到高亮。
 */
function pickHighlightFragment(fragments?: string[]): string | undefined {
  if (!fragments?.length) return undefined;
  return (
    fragments.find((fragment) => fragment.includes(HIGHLIGHT_PRE)) ??
    fragments[0]
  );
}

/**
 * 把带高亮标记的片段切分为分段，并合并相邻同标记段 ——
 * ik 分词会产生碎片化的相邻命中，直接渲染会出现「逐字高亮」的观感问题。
 */
function splitHighlight(fragment?: string): HighlightSegment[] | null {
  if (!fragment) return null;
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let hit = false;
  while (cursor < fragment.length) {
    const marker = hit ? HIGHLIGHT_POST : HIGHLIGHT_PRE;
    const index = fragment.indexOf(marker, cursor);
    if (index === -1) {
      pushSegment(segments, fragment.slice(cursor), hit);
      break;
    }
    pushSegment(segments, fragment.slice(cursor, index), hit);
    cursor = index + 1;
    hit = !hit;
  }
  return segments.length ? segments : null;
}

function pushSegment(
  segments: HighlightSegment[],
  text: string,
  hit: boolean,
): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.hit === hit) {
    last.text += text;
    return;
  }
  segments.push({ text, hit });
}

function sortByUpdatedAtDesc(hits: RetrievalHit[]): RetrievalHit[] {
  return [...hits].sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  );
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/** 从 bulk 返回的 items 中提取失败条目（I2）：单条错误不再被泛化错误吞掉 */
function extractBulkFailures(
  items: Array<
    Record<string, { _id?: string; error?: { reason?: string } }>
  > = [],
): BulkIndexFailure[] {
  const failures: BulkIndexFailure[] = [];
  for (const item of items) {
    for (const value of Object.values(item)) {
      if (!value?.error) continue;
      failures.push({
        chunkId: value._id ?? '',
        reason: value.error.reason ?? 'unknown',
      });
    }
  }
  return failures;
}
