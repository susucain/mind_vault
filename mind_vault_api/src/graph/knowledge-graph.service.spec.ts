import { KnowledgeGraphService } from './knowledge-graph.service';

/** 模拟 Neo4j 记录：get(key) 返回预设值 */
const record = (values: Record<string, unknown>) => ({
  get: (key: string) => values[key],
});

describe('KnowledgeGraphService', () => {
  it('normalizes entities and writes source-linked relationships', async () => {
    const tx = {
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn(),
    };
    const driver = { session: jest.fn().mockReturnValue(tx) };
    const service = new KnowledgeGraphService(driver as never);

    await service.indexChunk({
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      chunkId: 'chunk_1',
      entities: [
        { name: ' Kafka ', type: 'TECHNOLOGY' },
        { name: '消息队列', type: 'CONCEPT' },
      ],
      relations: [
        {
          source: 'Kafka',
          target: '消息队列',
          type: 'USED_FOR',
          confidence: 0.9,
        },
      ],
    });

    expect(tx.run).toHaveBeenCalledTimes(4);
    expect(tx.run.mock.calls[3]).toEqual([
      expect.stringContaining('MERGE (source)-[relation:USED_FOR'),
      expect.objectContaining({
        ownerId: 'user_1',
        sourceName: 'kafka',
        targetName: '消息队列',
        sourceChunkId: 'chunk_1',
      }),
    ]);
  });

  it('queries paths with owner and dataset-independent document scope', async () => {
    const tx = {
      run: jest.fn().mockResolvedValue({
        records: [
          {
            get: jest.fn((key: string) => {
              if (key === 'source') {
                return { properties: { name: 'Kafka', type: 'TECHNOLOGY' } };
              }
              if (key === 'target') {
                return { properties: { name: '消息队列', type: 'CONCEPT' } };
              }
              return [
                {
                  type: 'USED_FOR',
                  properties: { sourceChunkId: 'chunk_1' },
                },
              ];
            }),
          },
        ],
      }),
      close: jest.fn(),
    };
    const driver = { session: jest.fn().mockReturnValue(tx) };
    const service = new KnowledgeGraphService(driver as never);

    const result = await service.search({
      ownerId: 'user_1',
      entityNames: ['Kafka'],
      maxHops: 2,
    });

    expect(tx.run).toHaveBeenCalledWith(
      expect.stringContaining('ownerId: $ownerId'),
      expect.objectContaining({ ownerId: 'user_1', names: ['kafka'] }),
    );
    expect(result.relations[0]).toMatchObject({
      source: 'Kafka',
      target: '消息队列',
      type: 'USED_FOR',
    });
  });

  it('suggests entities by mention count with a normalized query', async () => {
    const tx = {
      run: jest.fn().mockResolvedValue({
        records: [
          record({
            id: 'kafka',
            name: 'Kafka',
            type: 'TECHNOLOGY',
            mentionCount: { toNumber: () => 5 },
          }),
          record({
            id: '消息队列',
            name: '消息队列',
            type: 'CONCEPT',
            mentionCount: 2,
          }),
        ],
      }),
      close: jest.fn(),
    };
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue(tx),
    } as never);

    const items = await service.findEntities({
      ownerId: 'user_1',
      q: '  Kafka ',
      types: ['TECHNOLOGY'],
      limit: 10,
    });

    expect(items).toEqual([
      { id: 'kafka', name: 'Kafka', type: 'TECHNOLOGY', mentionCount: 5 },
      { id: '消息队列', name: '消息队列', type: 'CONCEPT', mentionCount: 2 },
    ]);
    expect(tx.run).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT 10'),
      expect.objectContaining({
        ownerId: 'user_1',
        q: 'kafka',
        types: ['TECHNOLOGY'],
      }),
    );
  });

  it('builds a neighborhood view with degrees and focus flags', async () => {
    const focusResult = {
      records: [record({ id: 'kafka', name: 'Kafka', type: 'TECHNOLOGY' })],
    };
    const pathResult = {
      records: [
        {
          get: (key: string) =>
            key === 'pathNodes'
              ? [
                  {
                    properties: {
                      normalizedName: 'kafka',
                      name: 'Kafka',
                      type: 'TECHNOLOGY',
                    },
                  },
                  {
                    properties: {
                      normalizedName: '消息队列',
                      name: '消息队列',
                      type: 'CONCEPT',
                    },
                  },
                ]
              : [
                  {
                    type: 'USED_FOR',
                    properties: { sourceChunkId: 'chunk_1', confidence: 0.9 },
                  },
                ],
        },
      ],
    };
    const run = jest
      .fn()
      .mockResolvedValueOnce(focusResult)
      .mockResolvedValueOnce(pathResult);
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue({ run, close: jest.fn() }),
    } as never);

    const view = await service.neighborhood({
      ownerId: 'user_1',
      entities: ['Kafka'],
      maxHops: 1,
    });

    expect(view.focus).toBe('Kafka');
    expect(view.truncated).toBe(false);
    expect(view.nodes).toEqual([
      {
        id: 'kafka',
        name: 'Kafka',
        type: 'TECHNOLOGY',
        degree: 1,
        isFocus: true,
      },
      { id: '消息队列', name: '消息队列', type: 'CONCEPT', degree: 1 },
    ]);
    expect(view.edges).toEqual([
      {
        id: 'kafka|USED_FOR|消息队列|chunk_1',
        source: 'kafka',
        target: '消息队列',
        type: 'USED_FOR',
        confidence: 0.9,
        sourceChunkId: 'chunk_1',
      },
    ]);
    const calls = run.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][];
    expect(calls[1][0]).toContain('LIMIT 60');
    expect(calls[1][1]).toMatchObject({
      ownerId: 'user_1',
      names: ['kafka'],
      relationTypes: [],
      datasetIds: [],
    });
  });

  it('keeps focus nodes when filtering by entity type', async () => {
    const focusResult = {
      records: [record({ id: 'kafka', name: 'Kafka', type: 'TECHNOLOGY' })],
    };
    const pathResult = {
      records: [
        {
          get: (key: string) =>
            key === 'pathNodes'
              ? [
                  {
                    properties: {
                      normalizedName: 'kafka',
                      name: 'Kafka',
                      type: 'TECHNOLOGY',
                    },
                  },
                  {
                    properties: {
                      normalizedName: '消息队列',
                      name: '消息队列',
                      type: 'CONCEPT',
                    },
                  },
                ]
              : [
                  {
                    type: 'USED_FOR',
                    properties: { sourceChunkId: 'chunk_1' },
                  },
                ],
        },
      ],
    };
    const run = jest
      .fn()
      .mockResolvedValueOnce(focusResult)
      .mockResolvedValueOnce(pathResult);
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue({ run, close: jest.fn() }),
    } as never);

    const view = await service.neighborhood({
      ownerId: 'user_1',
      entities: ['Kafka'],
      entityTypes: ['TECHNOLOGY'],
    });

    expect(view.nodes.map((node) => node.id)).toEqual(['kafka']);
    expect(view.edges).toEqual([]);
  });

  it('returns an empty view without querying the graph when no entity is given', async () => {
    const driver = { session: jest.fn() };
    const service = new KnowledgeGraphService(driver as never);

    await expect(
      service.neighborhood({ ownerId: 'user_1', entities: ['  '] }),
    ).resolves.toEqual({ focus: '', nodes: [], edges: [], truncated: false });
    expect(driver.session).not.toHaveBeenCalled();
  });

  it('builds an answer-context view from the entities mentioned in the given chunks', async () => {
    const entityResult = {
      records: [
        record({ id: 'kafka', name: 'Kafka', type: 'TECHNOLOGY' }),
        record({ id: '消息队列', name: '消息队列', type: 'CONCEPT' }),
      ],
    };
    const edgeResult = {
      records: [
        record({
          sourceId: 'kafka',
          targetId: '消息队列',
          type: 'USED_FOR',
          sourceChunkId: 'chunk_1',
          confidence: 0.9,
        }),
      ],
    };
    const run = jest
      .fn()
      .mockResolvedValueOnce(entityResult)
      .mockResolvedValueOnce(edgeResult);
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue({ run, close: jest.fn() }),
    } as never);

    const view = await service.answerContext({
      ownerId: 'user_1',
      chunkIds: ['chunk_1', 'chunk_1', ''],
    });

    expect(view.focus).toBe('');
    expect(view.truncated).toBe(false);
    expect(view.nodes).toEqual([
      { id: 'kafka', name: 'Kafka', type: 'TECHNOLOGY', degree: 1 },
      { id: '消息队列', name: '消息队列', type: 'CONCEPT', degree: 1 },
    ]);
    expect(view.edges).toEqual([
      {
        id: 'kafka|USED_FOR|消息队列|chunk_1',
        source: 'kafka',
        target: '消息队列',
        type: 'USED_FOR',
        sourceChunkId: 'chunk_1',
        confidence: 0.9,
      },
    ]);
    const calls = run.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][];
    expect(calls[0][0]).toContain('LIMIT 30');
    // 入参先去重去空，Neo4j 才不会拿到重复的 chunkId
    expect(calls[0][1]).toEqual({ ownerId: 'user_1', chunkIds: ['chunk_1'] });
    expect(calls[1][0]).toContain('relation.sourceChunkId IN $chunkIds');
    expect(calls[1][1]).toEqual({
      ownerId: 'user_1',
      names: ['kafka', '消息队列'],
      chunkIds: ['chunk_1'],
    });
  });

  it('skips the edge query when the given chunks mention no entity', async () => {
    const run = jest.fn().mockResolvedValueOnce({ records: [] });
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue({ run, close: jest.fn() }),
    } as never);

    const view = await service.answerContext({
      ownerId: 'user_1',
      chunkIds: ['chunk_1'],
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(view).toEqual({ focus: '', nodes: [], edges: [], truncated: false });
  });

  it('caps the answer-context limit at 60 and flags truncation at the cap', async () => {
    const records = Array.from({ length: 60 }, (_, index) =>
      record({ id: `entity_${index}`, name: `实体${index}`, type: 'CONCEPT' }),
    );
    const run = jest
      .fn()
      .mockResolvedValueOnce({ records })
      .mockResolvedValueOnce({ records: [] });
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue({ run, close: jest.fn() }),
    } as never);

    const view = await service.answerContext({
      ownerId: 'user_1',
      chunkIds: ['chunk_1'],
      limit: 999,
    });

    const calls = run.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][];
    expect(calls[0][0]).toContain('LIMIT 60');
    expect(view.nodes).toHaveLength(60);
    expect(view.truncated).toBe(true);
  });

  it('returns an empty answer-context view without querying when no chunk is given', async () => {
    const driver = { session: jest.fn() };
    const service = new KnowledgeGraphService(driver as never);

    await expect(
      service.answerContext({ ownerId: 'user_1', chunkIds: [] }),
    ).resolves.toEqual({ focus: '', nodes: [], edges: [], truncated: false });
    expect(driver.session).not.toHaveBeenCalled();
  });
});
