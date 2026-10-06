import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentChunk } from '../../document/chunking/document-chunk';
import {
  HighlightSegment,
  RetrievalHit,
  RetrievalPage,
} from '../retrieval-hit';

export const ELASTICSEARCH_CLIENT = Symbol('ELASTICSEARCH_CLIENT');

/** 高亮标记用不可见控制字符，避免与正文冲突，且服务端会切分为分段而非返回 HTML */
const HIGHLIGHT_PRE = '\u0002';
const HIGHLIGHT_POST = '\u0003';

/** kNN 的 k 上限：k 即返回上限，超过后无法继续深翻页 */
export const VECTOR_K_CAP = 100;

interface ElasticsearchLike {
  indices: {
    exists(input: { index: string }): Promise<boolean>;
    create(input: unknown): Promise<unknown>;
  };
  bulk(input: {
    refresh: string;
    operations: unknown[];
  }): Promise<{ errors: boolean }>;
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
  private readonly indexName = 'mind_vault_chunks_v1';

  constructor(
    @Inject(ELASTICSEARCH_CLIENT)
    private readonly client: ElasticsearchLike,
    private readonly config: ConfigService,
  ) {}

  async ensureIndex() {
    const exists = await this.client.indices.exists({
      index: this.indexName,
    });
    if (exists) return;
    await this.client.indices.create({
      index: this.indexName,
      mappings: {
        properties: {
          chunkId: { type: 'keyword' },
          parentId: { type: 'keyword' },
          ownerId: { type: 'keyword' },
          documentId: { type: 'keyword' },
          datasetIds: { type: 'keyword' },
          documentVersion: { type: 'integer' },
          sectionId: { type: 'keyword' },
          chunkOrder: { type: 'integer' },
          // 索引端用 ik_max_word 提高召回，检索端用 ik_smart 提高精度
          titlePath: {
            type: 'text',
            analyzer: 'ik_max_word',
            search_analyzer: 'ik_smart',
          },
          titleKeyword: { type: 'keyword' },
          text: {
            type: 'text',
            analyzer: 'ik_max_word',
            search_analyzer: 'ik_smart',
          },
          parentContext: { type: 'text', index: false },
          locator: { type: 'object', enabled: true },
          embedding: {
            type: 'dense_vector',
            dims: this.embeddingDimensions(),
            index: true,
            similarity: 'cosine',
          },
          deleted: { type: 'boolean' },
          updatedAt: { type: 'date' },
        },
      },
    });
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
      refresh: 'wait_for',
      operations,
    });
    if (result.errors) throw new Error('Elasticsearch bulk 索引失败');
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

  async getByChunkIds(input: {
    ownerId: string;
    chunkIds: string[];
    datasetIds?: string[];
  }) {
    if (input.chunkIds.length === 0) return [];
    const result = await this.client.search({
      index: this.indexName,
      size: Math.min(input.chunkIds.length, 100),
      query: {
        bool: {
          filter: [
            ...this.filters(input.ownerId, input.datasetIds),
            { terms: { chunkId: input.chunkIds } },
          ],
        },
      },
    });
    return this.toHits(result, 'graph');
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
        text: { fragment_size: 240, number_of_fragments: 1 },
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
      highlight: splitHighlight(hit.highlight?.text?.[0]),
      updatedAt: optionalString(hit._source.updatedAt),
      score: hit._score ?? 0,
      sources: [source],
    }));
  }
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
