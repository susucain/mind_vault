/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { RetrievalHit } from './retrieval-hit';
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
    datasetIds: [],
    score,
    sources: [source],
  });

  /** ES 检索方法现在返回分页对象（hits / total / truncated），不再是裸数组 */
  const page = (hits: ReturnType<typeof hit>[]) => ({
    hits,
    total: hits.length,
    truncated: false,
  });

  it('fuses keyword and vector results with reciprocal rank fusion', async () => {
    const es = {
      keywordSearch: jest
        .fn()
        .mockResolvedValue(
          page([hit('chunk_a', 3, 'keyword'), hit('chunk_b', 2, 'keyword')]),
        ),
      vectorSearch: jest
        .fn()
        .mockResolvedValue(
          page([hit('chunk_b', 4, 'vector'), hit('chunk_c', 3, 'vector')]),
        ),
      getByChunkIds: jest.fn().mockResolvedValue([]),
    };
    const embedding = { embedQuery: jest.fn().mockResolvedValue([0.1]) };
    const graph = { search: jest.fn().mockResolvedValue({ relations: [] }) };
    const service = new RetrievalService(
      es as never,
      embedding as never,
      graph as never,
      {} as never,
      { get: jest.fn().mockReturnValue(0.75) } as never,
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
      keywordSearch: jest.fn().mockResolvedValue(page([])),
      vectorSearch: jest.fn().mockResolvedValue(page([])),
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
      {} as never,
      { get: jest.fn().mockReturnValue(0.75) } as never,
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

  it('treats the question as evidence-backed once the top vector score passes the threshold', async () => {
    const es = {
      vectorSearch: jest
        .fn()
        .mockResolvedValue(page([hit('chunk_a', 0.82, 'vector')])),
    };
    const service = new RetrievalService(
      es as never,
      { embedQuery: jest.fn().mockResolvedValue([0.1]) } as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(0.75) } as never,
    );

    await expect(
      service.assessEvidence({ ownerId: 'user_1', query: 'Kafka 的作用' }),
    ).resolves.toMatchObject({ hasEvidence: true });
  });

  it('reports no evidence when even the top vector score stays below the threshold', async () => {
    const es = {
      vectorSearch: jest
        .fn()
        .mockResolvedValue(page([hit('chunk_a', 0.61, 'vector')])),
    };
    const service = new RetrievalService(
      es as never,
      { embedQuery: jest.fn().mockResolvedValue([0.1]) } as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(0.75) } as never,
    );

    const result = await service.assessEvidence({
      ownerId: 'user_1',
      query: '1+1 等于几',
    });

    expect(result.hasEvidence).toBe(false);
    expect(result.hits).toHaveLength(1);
  });

  it('reuses precomputed vector hits instead of embedding the query again', async () => {
    const es = {
      keywordSearch: jest.fn().mockResolvedValue(page([])),
      vectorSearch: jest.fn(),
      getByChunkIds: jest.fn().mockResolvedValue([]),
    };
    const embedding = { embedQuery: jest.fn() };
    const service = new RetrievalService(
      es as never,
      embedding as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(0.75) } as never,
    );

    await service.hybrid({
      ownerId: 'user_1',
      query: 'Kafka',
      vectorHits: [hit('chunk_a', 0.9, 'vector')],
      topK: 3,
    });

    expect(embedding.embedQuery).not.toHaveBeenCalled();
    expect(es.vectorSearch).not.toHaveBeenCalled();
  });

  it('forwards the highlight flag to the keyword search', async () => {
    const es = { keywordSearch: jest.fn().mockResolvedValue(page([])) };
    const service = new RetrievalService(
      es as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(0.75) } as never,
    );

    await service.keyword({ ownerId: 'user_1', query: 'Kafka', highlight: true });

    expect(es.keywordSearch).toHaveBeenCalledWith(
      expect.objectContaining({ highlight: true }),
    );
  });

  it('enables highlight on the keyword leg of hybrid retrieval', async () => {
    const es = {
      keywordSearch: jest.fn().mockResolvedValue(page([])),
      vectorSearch: jest.fn().mockResolvedValue(page([])),
      getByChunkIds: jest.fn().mockResolvedValue([]),
    };
    const service = new RetrievalService(
      es as never,
      { embedQuery: jest.fn().mockResolvedValue([0.1]) } as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(0.75) } as never,
    );

    await service.hybrid({ ownerId: 'user_1', query: 'Kafka', topK: 3 });

    expect(es.keywordSearch).toHaveBeenCalledWith(
      expect.objectContaining({ highlight: true }),
    );
  });

  describe('search', () => {
    const meta = {
      enrich: jest.fn((_ownerId: string, hits: RetrievalHit[]) =>
        Promise.resolve(
          hits.map((entry) => ({
            ...entry,
            documentTitle: '文档标题',
            datasetNames: [] as string[],
          })),
        ),
      ),
    };

    const buildService = (
      es: object,
      extras: { embedding?: object; graph?: object } = {},
    ) =>
      new RetrievalService(
        es as never,
        (extras.embedding ?? {}) as never,
        (extras.graph ?? {}) as never,
        meta as never,
        { get: jest.fn().mockReturnValue(0.75) } as never,
      );

    it('normalizes keyword BM25 scores in-page and reports paging state', async () => {
      const es = {
        keywordSearch: jest.fn().mockResolvedValue({
          hits: [
            hit('chunk_a', 8, 'keyword'),
            hit('chunk_b', 4, 'keyword'),
            hit('chunk_c', 4, 'keyword'),
          ],
          total: 12,
          truncated: false,
        }),
      };

      const result = await buildService(es).search({
        ownerId: 'user_1',
        query: '消息队列',
        mode: 'keyword',
      });

      expect(es.keywordSearch).toHaveBeenCalledWith(
        expect.objectContaining({ highlight: true, page: 1, pageSize: 10 }),
      );
      expect(result.items.map((item) => item.score)).toEqual([1, 0, 0]);
      expect(result.items[0]).toMatchObject({
        scoreKind: 'normalized_bm25',
        documentTitle: '文档标题',
      });
      expect(result.total).toBe(12);
      expect(result.hasNext).toBe(true);
      expect(result.stats.bySource).toEqual({ keyword: 12 });
    });

    it('forces hasNext to false when the backend signals truncation', async () => {
      const es = {
        vectorSearch: jest.fn().mockResolvedValue({
          hits: [hit('chunk_a', 0.9, 'vector')],
          total: 50,
          truncated: true,
        }),
      };
      const embedding = { embedQuery: jest.fn().mockResolvedValue([0.1]) };

      const result = await buildService(es, { embedding }).search({
        ownerId: 'user_1',
        query: '一致性',
        mode: 'vector',
      });

      expect(result.mode).toBe('vector');
      expect(result.truncated).toBe(true);
      expect(result.hasNext).toBe(false);
      expect(result.items[0].scoreKind).toBe('cosine_similarity');
      expect(result.stats.bySource).toEqual({ vector: 50 });
    });

    it('scores graph hits by relation count instead of similarity', async () => {
      const es = {
        getByChunkIds: jest
          .fn()
          .mockResolvedValue([
            hit('chunk_a', 0, 'keyword'),
            hit('chunk_b', 0, 'keyword'),
          ]),
      };
      const graph = {
        neighborhood: jest.fn().mockResolvedValue({
          focus: 'Kafka',
          nodes: [],
          truncated: false,
          edges: [
            {
              id: 'e1',
              source: 'kafka',
              target: 'a',
              type: 'USES',
              sourceChunkId: 'chunk_a',
            },
            {
              id: 'e2',
              source: 'kafka',
              target: 'b',
              type: 'USES',
              sourceChunkId: 'chunk_a',
            },
            {
              id: 'e3',
              source: 'kafka',
              target: 'c',
              type: 'USES',
              sourceChunkId: 'chunk_b',
            },
          ],
        }),
      };

      const result = await buildService(es, { graph }).search({
        ownerId: 'user_1',
        query: 'Kafka',
        mode: 'graph',
        maxHops: 2,
      });

      expect(result.items.map((item) => item.score)).toEqual([2, 1]);
      expect(result.items[0].scoreKind).toBe('graph_degree');
      expect(result.graph?.focus).toBe('Kafka');
      expect(result.stats.bySource).toEqual({ graph: 2 });
    });

    it('fuses keyword, vector and graph routes with RRF in hybrid mode', async () => {
      const es = {
        keywordSearch: jest.fn().mockResolvedValue({
          hits: [hit('chunk_a', 3, 'keyword')],
          total: 1,
          truncated: false,
        }),
        vectorSearch: jest.fn().mockResolvedValue({
          hits: [hit('chunk_b', 0.8, 'vector')],
          total: 1,
          truncated: false,
        }),
        getByChunkIds: jest
          .fn()
          .mockResolvedValue([hit('chunk_c', 0, 'keyword')]),
      };
      const embedding = { embedQuery: jest.fn().mockResolvedValue([0.1]) };
      const graph = {
        neighborhood: jest.fn().mockResolvedValue({
          focus: 'Kafka',
          nodes: [],
          truncated: false,
          edges: [
            {
              id: 'e1',
              source: 'kafka',
              target: 'c',
              type: 'USES',
              sourceChunkId: 'chunk_c',
            },
          ],
        }),
      };

      const result = await buildService(es, { embedding, graph }).search({
        ownerId: 'user_1',
        query: 'Kafka',
        mode: 'hybrid',
        entityNames: ['Kafka'],
      });

      expect(result.items).toHaveLength(3);
      expect(result.items[0].scoreKind).toBe('rrf_fusion');
      expect(result.usedTools).toEqual(['keyword', 'vector', 'graph']);
      expect(result.stats.bySource).toEqual({
        keyword: 1,
        vector: 1,
        graph: 1,
      });
    });
  });
});
