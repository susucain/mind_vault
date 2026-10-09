import { RagModelService } from './rag-model.service';
import { RetrievalHit } from '../../retrieval/retrieval-hit';

describe('RagModelService', () => {
  it('streams a general answer through the fast model', async () => {
    const getModelName = jest.fn().mockReturnValue('fast-from-env');
    const streamText = jest
      .fn()
      .mockResolvedValue({ text: '通用回答', usage: {} });
    const service = new RagModelService({ getModelName, streamText } as never);

    await expect(
      service.answerGeneralStream({
        question: '什么是向量检索？',
        history: [],
        memories: [],
      }),
    ).resolves.toMatchObject({
      model: 'fast-from-env',
      thinking: false,
      text: '通用回答',
    });

    expect(getModelName).toHaveBeenCalledWith('fast');
    expect(streamText).toHaveBeenCalledWith(
      'fast',
      expect.any(Array),
      false,
      expect.any(Object),
    );
  });

  it('gives the model evidence by index and memories without ids', async () => {
    const streamText = jest.fn().mockResolvedValue({ text: '回答', usage: {} });
    const service = new RagModelService({
      getModelName: jest.fn().mockReturnValue('fast-model'),
      streamText,
    } as never);
    const hit: RetrievalHit = {
      chunkId: 'chunk_1',
      documentId: 'doc_1',
      text: '证据原文',
      parentContext: '证据原文',
      locator: { page: 1 },
      titlePath: [],
      score: 0.9,
      sources: ['vector'],
    };

    await service.answerStream({
      question: '问题',
      history: [],
      memories: [
        {
          id: 'memory_1',
          content: '用户偏好简短回答',
          kind: 'preference',
          score: 0.9,
        },
      ],
      hits: [hit],
      useReasoning: false,
    });

    const messages = (
      streamText.mock.calls as Array<
        [string, Array<{ content: string }>, boolean, unknown]
      >
    )[0][1];
    const payload = JSON.parse(messages[1].content) as {
      evidence: Array<{ index: number; text: string }>;
      memories: unknown;
    };
    // 证据只给序号与内容，不给内部 chunkId
    expect(payload.evidence).toEqual([
      { index: 1, text: '证据原文', locator: { page: 1 } },
    ]);
    // 记忆只交内容与类型，模型拿不到可引用的 id
    expect(payload.memories).toEqual([
      { content: '用户偏好简短回答', kind: 'preference' },
    ]);
  });

  it('asks the fast model for follow-up questions with a trimmed answer', async () => {
    const invokeJson = jest.fn().mockResolvedValue({
      data: { items: [' 那它的缺点呢 ', '还有别的方案吗', '怎么落地'] },
      usage: {},
    });
    const service = new RagModelService({ invokeJson } as never);

    const items = await service.suggestFollowups({
      question: 'Kafka 用在什么场景？',
      answer: 'A'.repeat(2000),
      documentNames: ['系统设计手册'],
    });

    expect(items).toEqual(['那它的缺点呢', '还有别的方案吗', '怎么落地']);
    const [kind, messages, , , options] = (
      invokeJson.mock.calls as Array<
        [
          string,
          Array<{ content: string }>,
          boolean,
          unknown,
          { maxTokens?: number },
        ]
      >
    )[0];
    expect(kind).toBe('fast');
    expect(options).toMatchObject({ maxTokens: 256 });
    const payload = JSON.parse(messages[1].content) as {
      question: string;
      answer: string;
      documents: string[];
    };
    // 只给问题、回答与文档名，且回答截断，避免这次附加调用变贵
    expect(payload.question).toBe('Kafka 用在什么场景？');
    expect(payload.answer).toHaveLength(1200);
    expect(payload.documents).toEqual(['系统设计手册']);
  });
});
