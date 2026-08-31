/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RetrievalService } from './retrieval.service';

describe('RetrievalService', () => {
  const hit = (
    chunkId: string,
    score: number,
    source: 'keyword' | 'vector',
  ) => ({
    chunkId,
    documentId: 'doc_1',
    text: chunkId,
    parentContext: chunkId,
    locator: {},
    titlePath: [],
    score,
    sources: [source],
  });

  it('fuses keyword and vector results with reciprocal rank fusion', async () => {
    const es = {
      keywordSearch: jest
        .fn()
        .mockResolvedValue([
          hit('chunk_a', 3, 'keyword'),
          hit('chunk_b', 2, 'keyword'),
        ]),
      vectorSearch: jest
        .fn()
        .mockResolvedValue([
          hit('chunk_b', 4, 'vector'),
          hit('chunk_c', 3, 'vector'),
        ]),
      getByChunkIds: jest.fn().mockResolvedValue([]),
    };
    const embedding = { embedQuery: jest.fn().mockResolvedValue([0.1]) };
    const graph = { search: jest.fn().mockResolvedValue({ relations: [] }) };
    const service = new RetrievalService(
      es as never,
      embedding as never,
      graph as never,
    );

    const result = await service.hybrid({
      ownerId: 'user_1',
      query: '消息队列',
      datasetIds: ['dataset_1'],
      topK: 3,
    });

    expect(result.hits[0]).toMatchObject({
      chunkId: 'chunk_b',
      sources: expect.arrayContaining(['keyword', 'vector']),
    });
    expect(embedding.embedQuery).toHaveBeenCalledWith('消息队列');
  });

  it('converts graph source chunks into graph retrieval hits', async () => {
    const es = {
      keywordSearch: jest.fn().mockResolvedValue([]),
      vectorSearch: jest.fn().mockResolvedValue([]),
      getByChunkIds: jest.fn().mockResolvedValue([
        {
          ...hit('chunk_graph', 0, 'keyword'),
          sources: ['keyword'],
        },
      ]),
    };
    const service = new RetrievalService(
      es as never,
      { embedQuery: jest.fn().mockResolvedValue([0.1]) } as never,
      {
        search: jest.fn().mockResolvedValue({
          relations: [{ sourceChunkId: 'chunk_graph' }],
        }),
      } as never,
    );

    const hits = await service.graph({
      ownerId: 'user_1',
      query: 'Kafka 的作用',
      entityNames: ['Kafka'],
      datasetIds: ['dataset_1'],
    });

    expect(hits).toEqual([
      expect.objectContaining({
        chunkId: 'chunk_graph',
        sources: ['graph'],
      }),
    ]);
  });
});
