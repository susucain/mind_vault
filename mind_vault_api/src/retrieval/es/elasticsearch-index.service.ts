import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentChunk } from '../../document/chunking/document-chunk';

export const ELASTICSEARCH_CLIENT = Symbol('ELASTICSEARCH_CLIENT');

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
      hits: Array<{
        _id: string;
        _score?: number;
        _source: Record<string, unknown>;
      }>;
    };
  }>;
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
          titlePath: { type: 'text', analyzer: 'standard' },
          titleKeyword: { type: 'keyword' },
          text: { type: 'text', analyzer: 'ik_max_word' },
          parentContext: { type: 'text', index: false },
          locator: { type: 'object', enabled: true },
          embedding: {
            type: 'dense_vector',
            dims: this.embeddingDimensions(),
            index: true,
            similarity: 'cosine',
          },
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
  }) {
    const result = await this.client.search({
      index: this.indexName,
      size: input.topK ?? 30,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: input.query,
                fields: ['titlePath^3', 'text', 'titleKeyword^2'],
              },
            },
          ],
          filter: this.filters(input.ownerId, input.datasetIds),
        },
      },
    });
    return this.toHits(result, 'keyword');
  }

  async vectorSearch(input: {
    ownerId: string;
    vector: number[];
    datasetIds?: string[];
    topK?: number;
  }) {
    const topK = input.topK ?? 30;
    const result = await this.client.search({
      index: this.indexName,
      knn: {
        field: 'embedding',
        query_vector: input.vector,
        k: topK,
        num_candidates: Math.max(topK * 3, 100),
        filter: this.filters(input.ownerId, input.datasetIds),
      },
    });
    return this.toHits(result, 'vector');
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

  private embeddingDimensions(): number {
    const configured =
      this.config.get<string | number>('EMBEDDING_DIMENSIONS') ??
      this.config.get<string | number>('EMBEDDING_DIMENSION') ??
      1024;
    const dimensions = Number(configured);
    if (!Number.isInteger(dimensions) || dimensions < 1) {
      throw new Error(`无效的 Embedding 维度: ${String(configured)}`);
    }
    return dimensions;
  }

  private filters(ownerId: string, datasetIds?: string[]) {
    const filters: unknown[] = [{ term: { ownerId } }];
    if (datasetIds?.length) {
      filters.push({ terms: { datasetIds } });
    }
    return filters;
  }

  private toHits(
    result: {
      hits: {
        hits: Array<{
          _id: string;
          _score?: number;
          _source: Record<string, unknown>;
        }>;
      };
    },
    source: 'keyword' | 'vector' | 'graph',
  ) {
    return result.hits.hits.map((hit) => ({
      chunkId: stringValue(hit._source.chunkId, hit._id),
      documentId: stringValue(hit._source.documentId),
      text: stringValue(hit._source.text),
      parentContext: stringValue(hit._source.parentContext),
      locator: objectValue(hit._source.locator),
      titlePath: stringArray(hit._source.titlePath),
      score: hit._score ?? 0,
      sources: [source],
    }));
  }
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
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
