/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ElasticsearchIndexService } from './elasticsearch-index.service';

describe('ElasticsearchIndexService', () => {
  it('creates the versioned chunk index and bulk indexes chunks', async () => {
    const client = {
      indices: {
        exists: jest.fn().mockResolvedValue(false),
        create: jest.fn().mockResolvedValue({}),
      },
      bulk: jest.fn().mockResolvedValue({ errors: false }),
    };
    const service = new ElasticsearchIndexService(
      client as never,
      {
        get: jest.fn((key: string, fallback: unknown) =>
          key === 'EMBEDDING_DIMENSIONS' ? 1024 : fallback,
        ),
      } as never,
    );
    await service.ensureIndex();
    await service.indexChunks([
      {
        chunkId: 'chunk_1',
        parentId: 'section_1',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        sectionId: 'section_1',
        chunkOrder: 0,
        titlePath: ['系统设计'],
        text: '消息队列',
        parentContext: '消息队列上下文',
        locator: { page: 1 },
        embedding: [0.1, 0.2],
      },
    ]);

    expect(client.indices.create).toHaveBeenCalled();
    expect(client.bulk).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh: 'wait_for',
        operations: expect.arrayContaining([
          expect.objectContaining({
            index: expect.objectContaining({ _index: 'mind_vault_chunks_v1' }),
          }),
        ]),
      }),
    );
  });
});
