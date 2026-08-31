import { RagAgentService } from './rag-agent.service';

describe('RagAgentService', () => {
  it('routes a lookup question to keyword retrieval and removes unsupported citations', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'lookup',
        complexity: 'low',
        entityNames: [],
      }),
      answer: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        result: {
          answer: 'Kafka 用于削峰。',
          citedChunkIds: ['chunk_1', 'invented_chunk'],
          confidence: 0.9,
        },
      }),
    };
    const retrieval = {
      keyword: jest.fn().mockResolvedValue([
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          text: 'Kafka 用于削峰。',
          parentContext: 'Kafka 用于削峰。',
          locator: { page: 1 },
          titlePath: [],
          score: 1,
          sources: ['keyword'],
        },
      ]),
      vector: jest.fn(),
      hybrid: jest.fn(),
    };
    const agent = new RagAgentService(models as never, retrieval as never);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: 'Kafka 有什么作用？',
      datasetIds: ['dataset_1'],
    });

    expect(retrieval.keyword).toHaveBeenCalled();
    expect(result.usedTools).toEqual(['keyword']);
    expect(result.citedChunkIds).toEqual(['chunk_1']);
    expect(result.thinking).toBe(false);
  });

  it('upgrades a low-confidence response to the reasoning model', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'medium',
        entityNames: [],
      }),
      answer: jest
        .fn()
        .mockResolvedValueOnce({
          model: 'qwen3.8-flash',
          thinking: false,
          result: { answer: '不确定', citedChunkIds: [], confidence: 0.2 },
        })
        .mockResolvedValueOnce({
          model: 'deepseek-v4-flash-0731',
          thinking: true,
          result: {
            answer: '证据化回答',
            citedChunkIds: ['chunk_1'],
            confidence: 0.8,
          },
        }),
    };
    const retrieval = {
      keyword: jest.fn(),
      vector: jest.fn().mockResolvedValue([
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          text: '证据',
          parentContext: '证据',
          locator: {},
          titlePath: [],
          score: 1,
          sources: ['vector'],
        },
      ]),
      hybrid: jest.fn(),
    };
    const agent = new RagAgentService(models as never, retrieval as never);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: '语义问题',
      datasetIds: [],
    });

    expect(models.answer).toHaveBeenCalledTimes(2);
    expect(result.model).toBe('deepseek-v4-flash-0731');
    expect(result.citedChunkIds).toEqual(['chunk_1']);
  });
});
