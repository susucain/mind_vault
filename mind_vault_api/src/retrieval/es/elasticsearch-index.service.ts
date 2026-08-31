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
}
