import { RagAgentService } from './rag-agent.service';
import { RetrievalHit } from '../../retrieval/retrieval-hit';

/** Langfuse 未启用时的形态：直接执行，不做任何包装 */
const tracingOff = {
  trace: (_context: unknown, fn: () => unknown) => fn(),
} as never;

/** 默认不含长期记忆，需要断言的用例单独传入 mock */
function buildAgent(models: unknown, retrieval: unknown, memories?: unknown) {
  return new RagAgentService(
    models as never,
    retrieval as never,
    (memories ?? {
      recallMemories: jest.fn().mockResolvedValue([]),
    }) as never,
    tracingOff,
  );
}

function hit(chunkId: string, text = '证据'): RetrievalHit {
  return {
    chunkId,
    documentId: `doc_${chunkId}`,
    text,
    parentContext: text,
    locator: {},
    titlePath: [],
    score: 0.9,
    sources: ['vector'],
  };
}

describe('RagAgentService', () => {
  it('emits stages as each RAG node actually starts', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'low',
        entityNames: [],
      }),
      answerStream: jest.fn(),
      answerGeneralStream: jest.fn().mockResolvedValue({
        model: 'fast-model',
        thinking: false,
        text: '回答',
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

  it('routes a lookup question to keyword retrieval and keeps only in-range citations', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'lookup',
        complexity: 'low',
        entityNames: [],
      }),
      answerStream: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        // [2] 越界（只有一条证据），必须被丢弃
        text: 'Kafka 用于削峰。[1][2]',
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [hit('chunk_1', 'Kafka 用于削峰。')],
        hasEvidence: true,
      }),
      keyword: jest
        .fn()
        .mockResolvedValue([hit('chunk_1', 'Kafka 用于削峰。')]),
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: 'Kafka 有什么作用？',
      datasetIds: ['dataset_1'],
    });

    // 引用片段要展示命中关键字，lookup 路径必须开启 ES 高亮
    expect(retrieval.keyword).toHaveBeenCalledWith(
      expect.objectContaining({ highlight: true }),
    );
    expect(result.usedTools).toEqual(['keyword']);
    expect(result.citedChunkIds).toEqual(['chunk_1']);
  });

  it('pre-decides the reasoning model when evidence is sparse', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'medium',
        entityNames: [],
      }),
      answerStream: jest.fn().mockResolvedValue({
        model: 'reasoning-model',
        thinking: true,
        text: '证据化回答[1]',
      }),
    };
    const retrieval = {
      assessEvidence: jest
        .fn()
        .mockResolvedValue({ hits: [hit('chunk_1')], hasEvidence: true }),
      keyword: jest.fn(),
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);

    const result = await agent.invoke({
      ownerId: 'user_1',
      question: '语义问题',
      datasetIds: [],
    });

    // 命中条数不足时生成前就升级，不再等生成完再整段重试
    expect(models.answerStream).toHaveBeenCalledWith(
      expect.objectContaining({ useReasoning: true }),
      expect.any(Object),
    );
    expect(models.answerStream).toHaveBeenCalledTimes(1);
    expect(result.model).toBe('reasoning-model');
    expect(result.citedChunkIds).toEqual(['chunk_1']);
  });

  it('keeps the fast model when evidence is plentiful', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'low',
        entityNames: [],
      }),
      answerStream: jest.fn().mockResolvedValue({
        model: 'fast-model',
        thinking: false,
        text: '基于多份证据的回答[1][2][3]',
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [hit('chunk_1'), hit('chunk_2'), hit('chunk_3')],
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

    expect(models.answerStream).toHaveBeenCalledWith(
      expect.objectContaining({ useReasoning: false }),
      expect.any(Object),
    );
    expect(result.citedChunkIds).toEqual(['chunk_1', 'chunk_2', 'chunk_3']);
  });

  it('falls back to a general-knowledge answer without retrieval when gating fails', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'lookup',
        complexity: 'low',
        entityNames: [],
      }),
      answerStream: jest.fn(),
      answerGeneralStream: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        text: '1 + 1 = 2。',
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [hit('chunk_junk', '无关内容')],
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
    expect(models.answerGeneralStream).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '1+1 等于几',
        history: [],
        memories: [],
      }),
      expect.any(Object),
    );
    expect(models.answerStream).not.toHaveBeenCalled();
    expect(retrieval.keyword).not.toHaveBeenCalled();
    expect(retrieval.hybrid).not.toHaveBeenCalled();
  });

  it('streams the no-evidence notice before the general answer', async () => {
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'lookup',
        complexity: 'low',
        entityNames: [],
      }),
      answerStream: jest.fn(),
      answerGeneralStream: jest
        .fn()
        .mockImplementation(
          (_input: unknown, options: { onToken?: (delta: string) => void }) => {
            options?.onToken?.('1 + 1 = 2。');
            return Promise.resolve({
              model: 'qwen3.8-flash',
              thinking: false,
              text: '1 + 1 = 2。',
            });
          },
        ),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [],
        hasEvidence: false,
      }),
      keyword: jest.fn(),
      hybrid: jest.fn(),
    };
    const agent = buildAgent(models, retrieval);
    const tokens: string[] = [];

    await agent.invoke(
      { ownerId: 'user_1', question: '1+1 等于几', datasetIds: [] },
      { onToken: (delta) => tokens.push(delta) },
    );

    // 先推提示行，再推模型正文，拼接结果与落库正文一致
    expect(tokens.join('')).toContain('未在资料中找到与问题相关的内容');
    expect(tokens.join('')).toContain('1 + 1 = 2。');
  });

  it('rewrites a follow-up with history before routing and retrieval', async () => {
    const history = [
      { role: 'user' as const, content: 'Kafka 有什么作用？' },
      { role: 'assistant' as const, content: 'Kafka 用于削峰填谷。' },
    ];
    const summary = '早前结论：Kafka 用于削峰填谷。';
    const models = {
      route: jest.fn().mockResolvedValue({
        intent: 'semantic',
        complexity: 'low',
        entityNames: [],
      }),
      rewriteQuery: jest.fn().mockResolvedValue('Kafka 有哪些缺点？'),
      answerStream: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        text: '运维成本高。[1]',
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [hit('chunk_1', 'Kafka 的缺点是运维成本高。')],
        hasEvidence: true,
      }),
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
    expect(models.answerStream).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Kafka 有哪些缺点？',
        summary,
        history,
      }),
      expect.any(Object),
    );
    expect(result.citedChunkIds).toEqual(['chunk_1']);
  });

  it('caps the history window by message count and character budget', async () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: 'user' as const,
      content: `第${index}条`.padEnd(800, '补'),
    }));
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
      answerStream: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        text: '答案',
      }),
    };
    const retrieval = {
      assessEvidence: jest
        .fn()
        .mockResolvedValue({ hits: [hit('chunk_1')], hasEvidence: true }),
      keyword: jest.fn().mockResolvedValue([hit('chunk_1')]),
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
      answerStream: jest.fn(),
      answerGeneralStream: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        text: '通用答案',
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
      answerStream: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        text: '运维成本高。[1]',
      }),
    };
    const retrieval = {
      assessEvidence: jest.fn().mockResolvedValue({
        hits: [hit('chunk_1', 'Kafka 的缺点是运维成本高。')],
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
    // 记忆作为背景注入，但正文只按证据序号引用，记忆 id 无法变成引用来源
    expect(models.answerStream).toHaveBeenCalledWith(
      expect.objectContaining({
        memories: [expect.objectContaining({ id: 'memory_1' })],
      }),
      expect.any(Object),
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
      answerStream: jest.fn().mockResolvedValue({
        model: 'qwen3.8-flash',
        thinking: false,
        text: '答案[1]',
      }),
    };
    const retrieval = {
      assessEvidence: jest
        .fn()
        .mockResolvedValue({ hits: [hit('chunk_1')], hasEvidence: true }),
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

    expect(result.answer).toBe('答案[1]');
    expect(models.answerStream).toHaveBeenCalledWith(
      expect.objectContaining({ memories: [] }),
      expect.any(Object),
    );
    expect(result.usedTools).not.toContain('memory');
  });
});
