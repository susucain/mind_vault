/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ElasticsearchIndexService } from './elasticsearch-index.service';

const config = () =>
  ({
    get: jest.fn((key: string, fallback: unknown) =>
      key === 'EMBEDDING_DIMENSIONS' ? 1024 : fallback,
    ),
  }) as never;

describe('ElasticsearchIndexService', () => {
  it('creates the versioned chunk index and bulk indexes chunks', async () => {
    const client = {
      indices: {
        exists: jest.fn().mockResolvedValue(false),
        create: jest.fn().mockResolvedValue({}),
      },
      bulk: jest.fn().mockResolvedValue({ errors: false }),
      updateByQuery: jest.fn().mockResolvedValue({}),
    };
    const service = new ElasticsearchIndexService(client as never, config());
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

  it('为标题与正文配置 IK 索引分词与检索分词', async () => {
    const client = {
      indices: {
        exists: jest.fn().mockResolvedValue(false),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new ElasticsearchIndexService(client as never, config());
    await service.ensureIndex();

    const calls = client.indices.create.mock.calls as unknown as [
      { mappings: { properties: Record<string, unknown> } },
    ][];
    const createInput = calls[0][0];
    const ikField = {
      type: 'text',
      analyzer: 'ik_max_word',
      search_analyzer: 'ik_smart',
    };
    expect(createInput.mappings.properties.titlePath).toEqual(ikField);
    expect(createInput.mappings.properties.text).toEqual(ikField);
  });

  it('正文与标题走 multi_match，标题精确命中走 titleKeyword term', async () => {
    const client = {
      search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
    };
    const service = new ElasticsearchIndexService(client as never, config());
    await service.keywordSearch({
      ownerId: 'user_1',
      query: '消息队列',
      topK: 5,
    });

    expect(client.search).toHaveBeenCalledWith({
      index: 'mind_vault_chunks_v1',
      size: 5,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: '消息队列',
                fields: ['titlePath^3', 'text'],
              },
            },
          ],
          should: [{ term: { titleKeyword: { value: '消息队列', boost: 5 } } }],
          filter: [
            { term: { ownerId: 'user_1' } },
            { bool: { must_not: { term: { deleted: true } } } },
          ],
        },
      },
    });
  });
});
