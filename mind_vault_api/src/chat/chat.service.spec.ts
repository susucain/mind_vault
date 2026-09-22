/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { ChatService } from './chat.service';
import { HistoryTurn } from './agent/rag-types';

interface FakeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function buildService(input: {
  messageCount: number;
  summary?: string | null;
  summarizedMessageCount?: number;
  summarizeResult?: string;
}) {
  const conversation = {
    id: 'conversation_1',
    ownerId: 'user_1',
    datasetIds: ['dataset_1'],
    summary: input.summary ?? null,
    summarizedMessageCount: input.summarizedMessageCount ?? 0,
  };
  const all: FakeMessage[] = Array.from(
    { length: input.messageCount },
    (_, index) => ({
      id: `message_${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `内容${index}`,
    }),
  );
  const messages = {
    count: jest.fn().mockResolvedValue(all.length),
    find: jest.fn(
      (options: {
        order: { createdAt: string };
        take?: number;
        skip?: number;
      }) => {
        const ordered =
          options.order.createdAt === 'DESC' ? [...all].reverse() : all;
        const from = options.skip ?? 0;
        return Promise.resolve(
          ordered.slice(from, from + (options.take ?? ordered.length)),
        );
      },
    ),
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => entity),
  };
  const conversations = {
    findOne: jest.fn().mockResolvedValue(conversation),
    save: jest.fn(async (entity) => entity),
  };
  const agent = {
    invoke: jest.fn().mockResolvedValue({
      answer: '答案',
      usedTools: ['vector'],
      thinking: false,
      confidence: 0.9,
      citedChunkIds: [],
      hits: [],
      answerMode: 'rag',
    }),
    summarize: jest.fn().mockResolvedValue(input.summarizeResult ?? '新摘要'),
  };
  const memories = { extractFromTurns: jest.fn().mockResolvedValue(0) };
  const service = new ChatService(
    conversations as never,
    messages as never,
    {} as never,
    agent as never,
    memories as never,
  );
  return {
    service,
    conversation,
    all,
    messages,
    conversations,
    agent,
    memories,
  };
}

function turnsOf(messages: FakeMessage[]): HistoryTurn[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

describe('ChatService', () => {
  it('passes only the recent window and skips compaction below the batch size', async () => {
    const { service, all, conversations, agent, memories } = buildService({
      messageCount: 10,
    });

    await service.ask('user_1', 'conversation_1', '继续说说');

    expect(agent.summarize).not.toHaveBeenCalled();
    expect(conversations.save).not.toHaveBeenCalled();
    expect(memories.extractFromTurns).not.toHaveBeenCalled();
    expect(agent.invoke).toHaveBeenCalledWith({
      ownerId: 'user_1',
      question: '继续说说',
      datasetIds: ['dataset_1'],
      summary: undefined,
      history: turnsOf(all.slice(-8)),
    });
  });

  it('compacts the overflow into the conversation summary and advances the cursor', async () => {
    const { service, all, conversations, agent, memories } = buildService({
      messageCount: 12,
    });

    await service.ask('user_1', 'conversation_1', '继续说说');

    expect(agent.summarize).toHaveBeenCalledWith({
      previousSummary: undefined,
      turns: turnsOf(all.slice(0, 4)),
    });
    expect(conversations.save).toHaveBeenCalledWith(
      expect.objectContaining({ summary: '新摘要', summarizedMessageCount: 4 }),
    );
    expect(agent.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ summary: '新摘要' }),
    );
    // 长期记忆抽取挂在压缩之后，输入正是刚被压缩的这批轮次
    expect(memories.extractFromTurns).toHaveBeenCalledWith({
      ownerId: 'user_1',
      conversationId: 'conversation_1',
      turns: turnsOf(all.slice(0, 4)),
    });
  });

  it('keeps the previous summary and cursor when compaction returns nothing', async () => {
    const { service, conversations, agent, memories } = buildService({
      messageCount: 12,
      summary: '旧摘要',
      summarizeResult: '',
    });

    await service.ask('user_1', 'conversation_1', '继续说说');

    expect(conversations.save).not.toHaveBeenCalled();
    expect(memories.extractFromTurns).not.toHaveBeenCalled();
    expect(agent.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ summary: '旧摘要' }),
    );
  });

  it('does not fail the answer when memory extraction throws', async () => {
    const { service, memories } = buildService({ messageCount: 12 });
    memories.extractFromTurns.mockRejectedValue(new Error('抽取不可用'));

    const result = await service.ask('user_1', 'conversation_1', '继续说说');
    // 抽取是 fire-and-forget，等一轮微任务跑完；若有未捕获异常 jest 会直接判失败
    await new Promise((resolve) => setImmediate(resolve));

    expect(result.message.content).toBe('答案');
  });

  it('persists an aborted assistant message when the request signal aborts', async () => {
    const { service, messages, agent } = buildService({ messageCount: 0 });
    const controller = new AbortController();
    controller.abort(new Error('客户端已取消'));
    agent.invoke.mockRejectedValue(controller.signal.reason);

    await expect(
      service.ask('user_1', 'conversation_1', '停止', {
        signal: controller.signal,
      }),
    ).rejects.toThrow('客户端已取消');

    expect(messages.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: '',
        status: 'ABORTED',
      }),
    );
  });

  it('persists an aborted assistant message when cancellation happens during memory loading', async () => {
    const { service, messages, agent } = buildService({ messageCount: 12 });
    const controller = new AbortController();
    agent.summarize.mockRejectedValue(new Error('客户端已取消'));
    controller.abort(new Error('客户端已取消'));

    await expect(
      service.ask('user_1', 'conversation_1', '停止', {
        signal: controller.signal,
      }),
    ).rejects.toThrow('客户端已取消');

    expect(messages.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'assistant',
        status: 'ABORTED',
      }),
    );
  });

  it('persists a failed assistant message when generation throws', async () => {
    const { service, messages, agent } = buildService({ messageCount: 0 });
    agent.invoke.mockRejectedValue(new Error('模型不可用'));

    await expect(
      service.ask('user_1', 'conversation_1', '失败'),
    ).rejects.toThrow('模型不可用');

    expect(messages.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: '',
        status: 'FAILED',
      }),
    );
  });
});
