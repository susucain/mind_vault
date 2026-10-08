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

    // 1 次骨架 + 1 次实体批量 + 1 次关系批量（按类型分组），与实体/关系数量解耦
    expect(tx.run).toHaveBeenCalledTimes(3);
    const calls = tx.run.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][];
    expect(calls[1][0]).toContain('UNWIND $entities');
    expect(calls[1][1]).toEqual(
      expect.objectContaining({
        ownerId: 'user_1',
        chunkId: 'chunk_1',
        entities: [
          {
            normalizedName: 'kafka',
            name: 'Kafka',
            type: 'TECHNOLOGY',
            alias: null,
          },
          {
            normalizedName: '消息队列',
            name: '消息队列',
            type: 'CONCEPT',
            alias: null,
          },
        ],
      }),
    );
    expect(calls[2][0]).toContain('MERGE (source)-[relation:USED_FOR');
    expect(calls[2][1]).toEqual(
      expect.objectContaining({
        ownerId: 'user_1',
        sourceChunkId: 'chunk_1',
        relations: [
          { sourceName: 'kafka', targetName: '消息队列', confidence: 0.9 },
        ],
      }),
    );
  });

  it('records the original spelling as an alias only when normalization changes it (G2)', async () => {
    const tx = {
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn(),
    };
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue(tx),
    } as never);

    await service.indexChunk({
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      chunkId: 'chunk_1',
      // 归一后与展示名不一致的写法才落别；纯大小写差异不算别名
      entities: [
        { name: 'Elasticsearch (ES)', type: 'TECHNOLOGY' },
        { name: 'Kafka', type: 'TECHNOLOGY' },
      ],
      relations: [],
    });

    const calls = tx.run.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][];
    expect(calls[1][1]).toEqual(
      expect.objectContaining({
        entities: [
          {
            normalizedName: 'elasticsearch',
            name: 'Elasticsearch (ES)',
            type: 'TECHNOLOGY',
            alias: 'Elasticsearch (ES)',
          },
          {
            normalizedName: 'kafka',
            name: 'Kafka',
            type: 'TECHNOLOGY',
            alias: null,
          },
        ],
      }),
    );
  });

  it('closes endpoints against existing entities and classifies drops (G3)', async () => {
    const tx = {
      run: jest
        .fn()
        // findExistingNames：同 owner 下已存在 kafka
        .mockResolvedValueOnce({ records: [record({ name: 'kafka' })] })
        .mockResolvedValue({ records: [] }),
      close: jest.fn(),
    };
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue(tx),
    } as never);

    const stats = await service.indexChunk({
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      chunkId: 'chunk_1',
      entities: [{ name: '消息队列', type: 'CONCEPT' }],
      relations: [
        // 端点 kafka 不在本 chunk，但同 owner 下已存在 → 保留
        {
          source: 'Kafka',
          target: '消息队列',
          type: 'USED_FOR',
          confidence: 0.9,
        },
        // 端点同 owner 也查不到 → 丢弃
        {
          source: '消息队列',
          target: '不存在的实体',
          type: 'USES',
          confidence: 0.5,
        },
        // 自环 → 丢弃
        {
          source: '消息队列',
          target: '消息队列',
          type: 'USES',
          confidence: 0.5,
        },
      ],
    });

    expect(stats).toEqual({
      entities: 1,
      relations: 1,
      dropped: { missingEndpoint: 1, selfLoop: 1, invalidType: 0 },
    });
    const calls = tx.run.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][];
    // 端点回查只带本 chunk 未覆盖的归一名
    expect(calls[0][0]).toContain('UNWIND $names');
    expect(calls[0][1]).toEqual({
      ownerId: 'user_1',
      names: ['kafka', '不存在的实体'],
    });
  });

  it('passes stored aliases through to the view nodes (G2)', async () => {
    const focusResult = {
      records: [
        record({
          id: 'elasticsearch',
          name: 'Elasticsearch',
          type: 'TECHNOLOGY',
          aliases: ['ES', 'Elasticsearch (ES)'],
        }),
      ],
    };
    const run = jest
      .fn()
      .mockResolvedValueOnce(focusResult)
      .mockResolvedValueOnce({ records: [] });
    const service = new KnowledgeGraphService({
      session: jest.fn().mockReturnValue({ run, close: jest.fn() }),
    } as never);

    const view = await service.neighborhood({
      ownerId: 'user_1',
      entities: ['Elasticsearch'],
    });

    expect(view.nodes).toEqual([
      expect.objectContaining({
        id: 'elasticsearch',
        aliases: ['ES', 'Elasticsearch (ES)'],
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

  it('deletes only the chunk nodes outside the kept set when cleaning orphans', async () => {
    const tx = {
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn(),
    };
    const driver = { session: jest.fn().mockReturnValue(tx) };
    const service = new KnowledgeGraphService(driver as never);

    await service.cleanupOrphanChunks('user_1', 'doc_1', ['chunk_new']);

    expect(tx.run).toHaveBeenCalledTimes(1);
    const calls = tx.run.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][];
    // 只删孤儿 Chunk；Document 与 Entity 一律保留
    expect(calls[0][0]).toContain('DETACH DELETE chunk');
    expect(calls[0][0]).not.toContain('DELETE entity');
    expect(calls[0][1]).toEqual({
      ownerId: 'user_1',
      documentId: 'doc_1',
      keepChunkIds: ['chunk_new'],
    });
    expect(tx.close).toHaveBeenCalled();
  });
});
