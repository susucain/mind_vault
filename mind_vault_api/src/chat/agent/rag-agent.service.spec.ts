import { RagAgentService } from './rag-agent.service';

/** 默认不含长期记忆，需要断言的用例单独传入 mock */
function buildAgent(models: unknown, retrieval: unknown, memories?: unknown) {
  return new RagAgentService(
    models as never,
    retrieval as never,
    (memories ?? {
      recallMemories: jest.fn().mockResolvedValue([]),
    }) as never,
  );
}

describe('RagAgentService', () => {
  it('emits stages as each RAG node actually starts', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'low',
        entityNames: [],
      }),
      answer: jest.fn().mockResolvedValue({
        model: 'fast-model',
        thinking: false,
        result: {
          answer: '回答',
          citedChunkIds: [],
          confidence: 0.9,
        },
      }),
      answerGeneral: jest.fn().mockResolvedValue({
        model: 'fast-model',
        thinking: false,
        result: {
          answer: '回答',
          citedChunkIds: [],
          confidence: 0.9,
        },
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [],
        hasEvidence: false,
      }),
    };
    const memories = { recallMemories: jest.fn().mockResolvedValue([]) };
    const agent = buildAgent(models, retrieval, memories);
    const stages: string[] = [];

    await agent.invoke(
      { ownerId: 'user_1', question: '问题', datasetIds: [] },
      { emitStage: (stage) => stages.push(stage) },
    );

    expect(stages).toEqual(['recall', 'classify', 'gate', 'answer']);
  });

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
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [
          {
            chunkId: 'chunk_1',
            documentId: 'doc_1',
            text: 'Kafka 用于削峰。',
            parentContext: 'Kafka 用于削峰。',
            locator: { page: 1 },
            titlePath: [],
            score: 0.9,
            sources: ['vector'],
          },
        ],
        hasEvidence: true,
      }),
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
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);

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
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [
          {
            chunkId: 'chunk_1',
            documentId: 'doc_1',
            text: '证据',
            parentContext: '证据',
            locator: {},
            titlePath: [],
            score: 0.9,
            sources: ['vector'],
          },
        ],
        hasEvidence: true,
      }),
      keyword: jest.fn(),
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: '语义问题',
      datasetIds: [],
    });

    expect(models.answer).toHaveBeenCalledTimes(2);
    expect(result.model).toBe('deepseek-v4-flash-0731');
    expect(result.citedChunkIds).toEqual(['chunk_1']);
  });

  it('falls back to a general-knowledge answer without retrieval when gating fails', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'lookup',
        complexity: 'low',
        entityNames: [],
      }),
      answer: jest.fn(),
      answerGeneral: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        result: {
          answer: '1 + 1 = 2。',
          citedChunkIds: [],
          confidence: 0.8,
        },
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [
          {
            chunkId: 'chunk_junk',
            documentId: 'doc_1',
            text: '无关内容',
            parentContext: '无关内容',
            locator: {},
            titlePath: [],
            score: 0.62,
            sources: ['vector'],
          },
        ],
        hasEvidence: false,
      }),
      keyword: jest.fn(),
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: '1+1 等于几',
      datasetIds: [],
    });

    expect(result.answerMode).toBe('general');
    expect(result.citedChunkIds).toEqual([]);
    expect(result.answer).toContain('未在资料中找到与问题相关的内容');
    expect(result.answer).toContain('1 + 1 = 2。');
    expect(models.answerGeneral).toHaveBeenCalledWith({
      question: '1+1 等于几',
      history: [],
      memories: [],
    });
    expect(models.answer).not.toHaveBeenCalled();
    expect(retrieval.keyword).not.toHaveBeenCalled();
    expect(retrieval.hybrid).not.toHaveBeenCalled();
  });

  it('rewrites a follow-up with history before routing and retrieval', async () => {
    const history = [
      { role: 'user' as const, content: 'Kafka 有什么作用？' },
      { role: 'assistant' as const, content: 'Kafka 用于削峰填谷。' },
    ];
    const summary = '早前结论：Kafka 用于削峰填谷。';
    const hit = {
      chunkId: 'chunk_1',
      documentId: 'doc_1',
      text: 'Kafka 的缺点是运维成本高。',
      parentContext: 'Kafka 的缺点是运维成本高。',
      locator: { page: 2 },
      titlePath: [],
      score: 0.91,
      sources: ['vector'],
    };
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'low',
        entityNames: [],
      }),
      rewriteQuery: jest.fn().mockResolvedValue('Kafka 有哪些缺点？'),
      answer: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        result: {
          answer: '运维成本高。',
          citedChunkIds: ['chunk_1'],
          confidence: 0.9,
        },
      }),
    };
    const retrieval = {
      assessEvidence: jest
        .fn()
        .mockResolvedValue({ hits: [hit], hasEvidence: true }),
      keyword: jest.fn(),
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: '那它的缺点呢？',
      datasetIds: ['dataset_1'],
      summary,
      history,
    });

    expect(models.rewriteQuery).toHaveBeenCalledWith({
      question: '那它的缺点呢？',
      summary,
      history,
    });
    expect(models.route).toHaveBeenCalledWith('Kafka 有哪些缺点？');
    expect(retrieval.assessEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Kafka 有哪些缺点？' }),
    );
    expect(models.answer).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Kafka 有哪些缺点？',
        summary,
        history,
      }),
    );
    expect(result.citedChunkIds).toEqual(['chunk_1']);
  });

  it('caps the history window by message count and character budget', async () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: 'user' as const,
      content: `第${index}条`.padEnd(800, '补'),
    }));
    const hit = {
      chunkId: 'chunk_1',
      documentId: 'doc_1',
      text: '证据',
      parentContext: '证据',
      locator: {},
      titlePath: [],
      score: 0.9,
      sources: ['vector'],
    };
    const captured: { history: { content: string }[] }[] = [];
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'lookup',
        complexity: 'low',
        entityNames: [],
      }),
      rewriteQuery: jest.fn((input: { history: { content: string }[] }) => {
        captured.push(input);
        return Promise.resolve('改写后的问题');
      }),
      answer: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        result: { answer: '答案', citedChunkIds: [], confidence: 0.9 },
      }),
    };
    const retrieval = {
      assessEvidence: jest
        .fn()
        .mockResolvedValue({ hits: [hit], hasEvidence: true }),
      keyword: jest.fn().mockResolvedValue([hit]),
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);

    await agent.invoke({
      ownerId: 'user_1',
      question: '继续',
      datasetIds: ['dataset_1'],
      history,
    });

    const passed = captured[0];
    const totalChars = passed.history.reduce(
      (sum, turn) => sum + turn.content.length,
      0,
    );
    expect(passed.history).toHaveLength(4);
    expect(totalChars).toBeLessThanOrEqual(2000);
    expect(passed.history.at(-1)?.content).toContain('第11条');
  });

  it('skips rewrite and history when the conversation has no prior turns', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'lookup',
        complexity: 'low',
        entityNames: [],
      }),
      rewriteQuery: jest.fn(),
      answer: jest.fn(),
      answerGeneral: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        result: { answer: '通用答案', citedChunkIds: [], confidence: 0.5 },
      }),
    };
    const retrieval = {
      assessEvidence: jest
        .fn()
        .mockResolvedValue({ hits: [], hasEvidence: false }),
      keyword: jest.fn(),
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);

    await agent.invoke({
      ownerId: 'user_1',
      question: 'Kafka 有什么作用？',
      datasetIds: ['dataset_1'],
    });

    expect(models.rewriteQuery).not.toHaveBeenCalled();
    expect(retrieval.assessEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Kafka 有什么作用？' }),
    );
  });

  it('injects recalled memories as background without letting them become citations', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'low',
        entityNames: [],
      }),
      answer: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        result: {
          answer: '运维成本高。',
          // 模型把记忆 id 混进引用，编排层必须过滤掉
          citedChunkIds: ['chunk_1', 'memory_1'],
          confidence: 0.9,
        },
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [
          {
            chunkId: 'chunk_1',
            documentId: 'doc_1',
            text: 'Kafka 的缺点是运维成本高。',
            parentContext: 'Kafka 的缺点是运维成本高。',
            locator: { page: 2 },
            titlePath: [],
            score: 0.91,
            sources: ['vector'],
          },
        ],
        hasEvidence: true,
      }),
      keyword: jest.fn(),
      hybrid: jest.fn(),
    };
    const memories = {
      recallMemories: jest.fn().mockResolvedValue([
        {
          id: 'memory_1',
          content: '用户偏好简短回答',
          kind: 'preference',
          score: 0.9,
        },
      ]),
    };
    const agent = buildAgent(models, retrieval, memories);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: 'Kafka 有什么缺点？',
      datasetIds: ['dataset_1'],
    });

    expect(memories.recallMemories).toHaveBeenCalledWith(
      'user_1',
      'Kafka 有什么缺点？',
    );
    expect(models.answer).toHaveBeenCalledWith(
      expect.objectContaining({
        memories: [expect.objectContaining({ id: 'memory_1' })],
      }),
    );
    expect(result.citedChunkIds).toEqual(['chunk_1']);
    expect(result.usedTools).toContain('memory');
  });

  it('keeps answering when memory recall fails', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'low',
        entityNames: [],
      }),
      answer: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        result: { answer: '答案', citedChunkIds: ['chunk_1'], confidence: 0.9 },
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [
          {
            chunkId: 'chunk_1',
            documentId: 'doc_1',
            text: '证据',
            parentContext: '证据',
            locator: {},
            titlePath: [],
            score: 0.9,
            sources: ['vector'],
          },
        ],
        hasEvidence: true,
      }),
      keyword: jest.fn(),
      hybrid: jest.fn(),
    };
    const memories = {
      recallMemories: jest
        .fn()
        .mockRejectedValue(new Error('embedding 不可用')),
    };
    const agent = buildAgent(models, retrieval, memories);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: 'Kafka 有什么作用？',
      datasetIds: ['dataset_1'],
    });

    expect(result.answer).toBe('答案');
    expect(models.answer).toHaveBeenCalledWith(
      expect.objectContaining({ memories: [] }),
    );
    expect(result.usedTools).not.toContain('memory');
  });
});
