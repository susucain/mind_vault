/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ElasticsearchIndexService,
  VECTOR_K_CAP,
} from './elasticsearch-index.service';

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

  it('splits highlight fragments into segments and merges adjacent marks', async () => {
    const client = {
      search: jest.fn().mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'chunk_1',
              _score: 2,
              _source: {
                chunkId: 'chunk_1',
                documentId: 'doc_1',
                text: '消息队列',
                parentContext: '',
                locator: {},
                titlePath: [],
                datasetIds: ['dataset_1'],
              },
              highlight: { text: ['\u0002消息\u0003\u0002队列\u0003用于削峰'] },
            },
          ],
        },
      }),
    };
    const service = new ElasticsearchIndexService(client as never, config());

    const page = await service.keywordSearch({
      ownerId: 'user_1',
      query: '消息队列',
      page: 1,
      pageSize: 10,
      highlight: true,
    });

    expect(page.hits[0].highlight).toEqual([
      { text: '消息队列', hit: true },
      { text: '用于削峰', hit: false },
    ]);
    expect(page.total).toBe(1);
    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 10,
        track_total_hits: true,
        highlight: expect.objectContaining({
          pre_tags: ['\u0002'],
          post_tags: ['\u0003'],
        }),
      }),
    );
  });

  it('applies offset pagination, time range and recent sort to keyword search', async () => {
    const client = {
      search: jest.fn().mockResolvedValue({
        hits: { total: { value: 30 }, hits: [] },
      }),
    };
    const service = new ElasticsearchIndexService(client as never, config());

    await service.keywordSearch({
      ownerId: 'user_1',
      query: '一致性',
      page: 3,
      pageSize: 10,
      sort: 'recent',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });

    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 10,
        from: 20,
        track_total_hits: true,
        sort: [{ updatedAt: { order: 'desc' } }],
        query: expect.objectContaining({
          bool: expect.objectContaining({
            filter: expect.arrayContaining([
              {
                range: {
                  updatedAt: {
                    gte: '2026-01-01T00:00:00.000Z',
                    lte: '2026-02-01T00:00:00.000Z',
                  },
                },
              },
            ]),
          }),
        }),
      }),
    );
  });

  it('caps kNN pagination at the vector cap and flags truncation', async () => {
    const client = {
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: Array.from({ length: VECTOR_K_CAP }, (_, index) => ({
            _id: `chunk_${index}`,
            _score: 1,
            _source: { chunkId: `chunk_${index}` },
          })),
        },
      }),
    };
    const service = new ElasticsearchIndexService(client as never, config());

    const firstPage = await service.vectorSearch({
      ownerId: 'user_1',
      vector: [0.1],
      page: 1,
      pageSize: 20,
    });
    const lastPage = await service.vectorSearch({
      ownerId: 'user_1',
      vector: [0.1],
      page: 5,
      pageSize: 20,
    });

    const calls = client.search.mock.calls as unknown as [
      { knn: { k: number } },
    ][];
    expect(calls[0][0].knn.k).toBe(21);
    expect(firstPage.hits).toHaveLength(20);
    expect(firstPage.truncated).toBe(false);
    expect(calls[1][0].knn.k).toBe(VECTOR_K_CAP);
    expect(lastPage.truncated).toBe(true);
  });
});
