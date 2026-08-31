import { KnowledgeGraphService } from './knowledge-graph.service';

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
});
