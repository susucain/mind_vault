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
  datasetIds?: string[];
}) {
  const conversation = {
    id: 'conversation_1',
    ownerId: 'user_1',
    datasetIds: input.datasetIds ?? ['dataset_1'],
    favorite: false,
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
    // 返回浅拷贝：真实仓储不会把同一对象引用回写，测试里也才能看到每个阶段的状态快照
    save: jest.fn(async (entity) => ({ ...entity })),
  };
  const conversations = {
    findOne: jest.fn().mockResolvedValue(conversation),
    save: jest.fn(async (entity) => entity),
  };
  const datasets = {
    find: jest.fn().mockResolvedValue([]),
  };
  const citations = {
    find: jest.fn().mockResolvedValue([] as unknown[]),
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => ({ ...entity })),
  };
  // 文档名在读取时批量解析，默认无命中标题（文档已删除的情形）
  const documentMeta = {
    titlesOf: jest.fn().mockResolvedValue(new Map<string, string>()),
  };
  const agent = {
    invoke: jest.fn().mockResolvedValue({
      answer: '答案',
      usedTools: ['vector'],
      thinking: false,
      citedChunkIds: [],
      hits: [],
      answerMode: 'rag',
    }),
    summarize: jest.fn().mockResolvedValue(input.summarizeResult ?? '新摘要'),
    // 默认「条数不足」：追问推荐回落静态引导，主流程不受影响
    suggestFollowups: jest.fn().mockResolvedValue([]),
  };
  const memories = {
    extractFromTurns: jest.fn().mockResolvedValue(0),
    handleExplicit: jest.fn().mockResolvedValue({ action: 'none' }),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'chat.followupSuggestionsEnabled') return true;
      if (key === 'chat.followupTimeoutMs') return 3000;
      return undefined;
    }),
  };
  const service = new ChatService(
    conversations as never,
    messages as never,
    citations as never,
    agent as never,
    memories as never,
    datasets as never,
    documentMeta as never,
    config as never,
  );
  return {
    service,
    conversation,
    all,
    messages,
    conversations,
    datasets,
    citations,
    documentMeta,
    agent,
    memories,
    config,
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
    const { service, conversation, all, conversations, agent, memories } =
      buildService({
        messageCount: 10,
      });

    await service.ask('user_1', 'conversation_1', '继续说说');

    expect(agent.summarize).not.toHaveBeenCalled();
    expect(conversations.save).toHaveBeenCalledWith(conversation);
    expect(memories.extractFromTurns).not.toHaveBeenCalled();
    expect(agent.invoke).toHaveBeenCalledWith(
      {
        ownerId: 'user_1',
        question: '继续说说',
        datasetIds: ['dataset_1'],
        summary: undefined,
        history: turnsOf(all.slice(-8)),
      },
      // sessionId 只用于把 trace 归到同一条会话下，不进模型输入
      expect.objectContaining({ sessionId: 'conversation_1' }),
    );
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
      expect.objectContaining({ sessionId: 'conversation_1' }),
    );
    // 长期记忆抽取挂在压缩之后，输入正是刚被压缩的这批轮次
    expect(memories.extractFromTurns).toHaveBeenCalledWith({
      ownerId: 'user_1',
      conversationId: 'conversation_1',
      turns: turnsOf(all.slice(0, 4)),
    });
  });

  it('keeps the previous summary and cursor when compaction returns nothing', async () => {
    const { service, conversation, conversations, agent, memories } =
      buildService({
        messageCount: 12,
        summary: '旧摘要',
        summarizeResult: '',
      });

    await service.ask('user_1', 'conversation_1', '继续说说');

    expect(conversations.save).toHaveBeenCalledWith(conversation);
    expect(memories.extractFromTurns).not.toHaveBeenCalled();
    expect(agent.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ summary: '旧摘要' }),
      expect.objectContaining({ sessionId: 'conversation_1' }),
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

  it('streams deltas through onToken and finalizes the same assistant row', async () => {
    const { service, messages, agent } = buildService({ messageCount: 0 });
    agent.invoke.mockImplementation(
      (_input: unknown, options: { onToken?: (delta: string) => void }) => {
        options.onToken?.('第一段');
        options.onToken?.('第二段');
        return Promise.resolve({
          answer: '第一段第二段',
          usedTools: ['vector'],
          thinking: false,
          citedChunkIds: [],
          hits: [],
          answerMode: 'rag',
        });
      },
    );
    const tokens: string[] = [];
    const started: string[] = [];

    const result = await service.ask('user_1', 'conversation_1', '问题', {
      onToken: (delta) => tokens.push(delta),
      onMessageStart: (message) => started.push(message.id),
    });

    expect(tokens.join('')).toBe('第一段第二段');
    expect(started).toHaveLength(1);
    // 同一行先落 STREAMING 再更新为 COMPLETED，不新建第二条助手消息
    const assistantSaves = (
      messages.save.mock.calls as Array<
        [FakeMessage & { status: string; usedTools: string[] }]
      >
    )
      .map(([entity]) => entity)
      .filter((entity) => entity.role === 'assistant');
    expect(assistantSaves).toHaveLength(2);
    expect(assistantSaves[0].status).toBe('STREAMING');
    expect(assistantSaves[1]).toMatchObject({
      status: 'COMPLETED',
      content: '第一段第二段',
      usedTools: ['vector'],
    });
    expect(result.message.id).toBe(started[0]);
  });

  it('names a default conversation from its first question', async () => {
    const { service, conversation, conversations } = buildService({
      messageCount: 0,
    });
    conversation.title = '资料问答';

    await service.ask(
      'user_1',
      'conversation_1',
      '请总结这个项目的核心难点和关键技术取舍',
    );

    expect(conversations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '请总结这个项目的核心难点和关键技术取舍',
      }),
    );
  });

  it('updates a conversation dataset scope after validating ownership', async () => {
    const { service, conversation, datasets, conversations } = buildService({
      messageCount: 0,
      datasetIds: ['dataset_1'],
    });
    datasets.find.mockResolvedValue([
      { id: 'dataset_1', ownerId: 'user_1', deleted: false },
      { id: 'dataset_2', ownerId: 'user_1', deleted: false },
    ]);

    const result = await service.updateConversation(
      'user_1',
      'conversation_1',
      { datasetIds: ['dataset_2', 'dataset_2', 'dataset_1'] },
    );

    expect(conversation.datasetIds).toEqual(['dataset_2', 'dataset_1']);
    expect(conversations.save).toHaveBeenCalledWith(conversation);
    expect(result).toBe(conversation);
  });

  it('passes the updated dataset scope to the next ask', async () => {
    const { service, conversation, agent } = buildService({
      messageCount: 0,
      datasetIds: ['dataset_2'],
    });
    conversation.datasetIds = ['dataset_1'];

    await service.ask('user_1', 'conversation_1', '下一问');

    expect(agent.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ datasetIds: ['dataset_1'] }),
      expect.objectContaining({ sessionId: 'conversation_1' }),
    );
  });

  it('rejects a dataset scope containing an unknown dataset', async () => {
    const { service, datasets } = buildService({ messageCount: 0 });
    datasets.find.mockResolvedValue([]);

    await expect(
      service.updateConversation('user_1', 'conversation_1', {
        datasetIds: ['missing'],
      }),
    ).rejects.toThrow('资料集不存在或无权访问');
  });

  it('treats an empty dataset scope as all datasets and rejects an oversized one', async () => {
    const { service, conversation, conversations } = buildService({
      messageCount: 0,
      datasetIds: ['dataset_1'],
    });

    await service.updateConversation('user_1', 'conversation_1', {
      datasetIds: [],
    });

    expect(conversation.datasetIds).toEqual([]);
    expect(conversations.save).toHaveBeenCalledWith(conversation);
    await expect(
      service.updateConversation('user_1', 'conversation_1', {
        datasetIds: Array.from({ length: 21 }, (_, index) => `dataset_${index}`),
      }),
    ).rejects.toThrow('资料集范围最多包含 20 个资料集');
  });

  it('toggles the favorite flag without touching the dataset scope', async () => {
    const { service, conversation, conversations, datasets } = buildService({
      messageCount: 0,
      datasetIds: ['dataset_1'],
    });

    const favorited = await service.updateConversation(
      'user_1',
      'conversation_1',
      { favorite: true },
    );

    expect(datasets.find).not.toHaveBeenCalled();
    expect(conversation.datasetIds).toEqual(['dataset_1']);
    expect(conversation.favorite).toBe(true);
    expect(conversations.save).toHaveBeenCalledWith(conversation);
    expect(favorited.favorite).toBe(true);
  });

  it('resolves document names for stored citations when listing messages', async () => {
    const { service, citations, documentMeta } = buildService({
      messageCount: 2,
    });
    citations.find.mockResolvedValue([
      {
        id: 'citation_1',
        messageId: 'message_1',
        ownerId: 'user_1',
        documentId: 'doc_1',
        chunkId: 'chunk_1',
        quote: '片段',
        locator: { page: 1 },
        rank: 0,
      },
    ]);
    documentMeta.titlesOf.mockResolvedValue(
      new Map([['doc_1', '系统设计手册']]),
    );

    const { items } = await service.listMessages('user_1', 'conversation_1');

    expect(documentMeta.titlesOf).toHaveBeenCalledWith('user_1', ['doc_1']);
    expect(items[1].citations).toEqual([
      expect.objectContaining({
        id: 'citation_1',
        documentName: '系统设计手册',
      }),
    ]);
  });

  it('leaves the document name empty when the document no longer exists', async () => {
    const { service, citations } = buildService({ messageCount: 2 });
    citations.find.mockResolvedValue([
      {
        id: 'citation_1',
        messageId: 'message_1',
        ownerId: 'user_1',
        documentId: 'doc_deleted',
        chunkId: 'chunk_1',
        quote: '片段',
        locator: { page: 1 },
        rank: 0,
      },
    ]);

    const { items } = await service.listMessages('user_1', 'conversation_1');

    expect(items[1].citations).toEqual([
      expect.objectContaining({ documentId: 'doc_deleted', documentName: '' }),
    ]);
  });

  it('attaches document names to the citations returned by ask', async () => {
    const { service, agent, documentMeta } = buildService({ messageCount: 0 });
    agent.invoke.mockResolvedValue({
      answer: '答案',
      usedTools: ['keyword'],
      thinking: false,
      citedChunkIds: ['chunk_1'],
      hits: [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          text: '命中片段内容',
          parentContext: '',
          locator: { page: 1 },
          titlePath: [],
          datasetIds: ['dataset_1'],
          score: 1,
          sources: ['keyword'],
        },
      ],
      answerMode: 'rag',
    });
    documentMeta.titlesOf.mockResolvedValue(
      new Map([['doc_1', '系统设计手册']]),
    );

    const result = await service.ask('user_1', 'conversation_1', '问题');

    expect(result.citations).toEqual([
      expect.objectContaining({
        documentId: 'doc_1',
        documentName: '系统设计手册',
      }),
    ]);
  });

  it('persists the highlight segments carried by a keyword hit', async () => {
    const { service, agent, citations } = buildService({ messageCount: 0 });
    const highlight = [
      { text: 'Kafka', hit: true },
      { text: ' 用于削峰', hit: false },
    ];
    agent.invoke.mockResolvedValue({
      answer: '答案',
      usedTools: ['keyword'],
      thinking: false,
      citedChunkIds: ['chunk_1'],
      hits: [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          text: 'Kafka 用于削峰',
          parentContext: '',
          locator: { page: 1 },
          titlePath: [],
          datasetIds: ['dataset_1'],
          highlight,
          score: 1,
          sources: ['keyword'],
        },
      ],
      answerMode: 'rag',
    });

    const result = await service.ask('user_1', 'conversation_1', '问题');

    expect(citations.create).toHaveBeenCalledWith(
      expect.objectContaining({ chunkId: 'chunk_1', highlight }),
    );
    expect(result.citations[0].highlight).toEqual(highlight);
  });

  it('stores a null highlight for a vector-only hit', async () => {
    const { service, agent, citations } = buildService({ messageCount: 0 });
    agent.invoke.mockResolvedValue({
      answer: '答案',
      usedTools: ['vector'],
      thinking: false,
      citedChunkIds: ['chunk_1'],
      hits: [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          text: '语义命中片段',
          parentContext: '',
          locator: { page: 1 },
          titlePath: [],
          datasetIds: ['dataset_1'],
          score: 0.9,
          sources: ['vector'],
        },
      ],
      answerMode: 'rag',
    });

    const result = await service.ask('user_1', 'conversation_1', '问题');

    expect(citations.create).toHaveBeenCalledWith(
      expect.objectContaining({ chunkId: 'chunk_1', highlight: null }),
    );
    expect(result.citations[0].highlight).toBeNull();
  });

  it('handles an explicit memory request without invoking the RAG agent', async () => {
    const { service, agent, memories, messages } = buildService({
      messageCount: 0,
    });
    memories.handleExplicit.mockResolvedValue({
      action: 'saved',
      content: '用户今年 30 岁',
    });

    const result = await service.ask(
      'user_1',
      'conversation_1',
      '记住我的年龄是 30 岁',
    );

    expect(agent.invoke).not.toHaveBeenCalled();
    expect(result.answerMode).toBe('general');
    expect(result.memoryAction).toEqual({
      action: 'saved',
      content: '用户今年 30 岁',
    });
    expect(messages.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: '已记住：用户今年 30 岁',
        usedTools: ['memory'],
      }),
    );
  });

  it('persists the follow-up suggestions generated after the answer', async () => {
    const { service, agent, documentMeta, messages } = buildService({
      messageCount: 0,
    });
    documentMeta.titlesOf.mockResolvedValue(
      new Map([['doc_1', '系统设计手册']]),
    );
    agent.invoke.mockResolvedValue({
      answer: '答案',
      usedTools: ['keyword'],
      thinking: false,
      citedChunkIds: ['chunk_1'],
      hits: [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          text: '命中片段',
          parentContext: '',
          locator: { page: 1 },
          titlePath: [],
          datasetIds: ['dataset_1'],
          score: 0.9,
          sources: ['keyword'],
        },
      ],
      answerMode: 'rag',
    });
    agent.suggestFollowups.mockResolvedValue(['那它的缺点呢', '还有别的方案吗', '怎么落地']);

    const result = await service.ask('user_1', 'conversation_1', '问题');

    // 只把问题、回答与命中文档名交给推荐器，不塞证据全文
    expect(agent.suggestFollowups).toHaveBeenCalledWith(
      { question: '问题', answer: '答案', documentNames: ['系统设计手册'] },
      expect.objectContaining({ sessionId: 'conversation_1' }),
    );
    expect(result.suggestions).toEqual([
      '那它的缺点呢',
      '还有别的方案吗',
      '怎么落地',
    ]);
    expect(messages.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        suggestions: ['那它的缺点呢', '还有别的方案吗', '怎么落地'],
      }),
    );
  });

  it('drops a half-filled follow-up set so the frontend can fall back', async () => {
    const { service, agent } = buildService({ messageCount: 0 });
    agent.suggestFollowups.mockResolvedValue(['只有一条']);

    const result = await service.ask('user_1', 'conversation_1', '问题');

    expect(result.suggestions).toEqual([]);
  });

  it('skips the follow-up call entirely when the switch is off', async () => {
    const { service, agent, config } = buildService({ messageCount: 0 });
    config.get.mockImplementation((key: string) =>
      key === 'chat.followupSuggestionsEnabled' ? false : 3000,
    );

    const result = await service.ask('user_1', 'conversation_1', '问题');

    expect(agent.suggestFollowups).not.toHaveBeenCalled();
    expect(result.suggestions).toEqual([]);
  });

  it('keeps the answer when the follow-up call fails', async () => {
    const { service, agent } = buildService({ messageCount: 0 });
    agent.suggestFollowups.mockRejectedValue(new Error('模型不可用'));

    const result = await service.ask('user_1', 'conversation_1', '问题');

    expect(result.message.content).toBe('答案');
    expect(result.suggestions).toEqual([]);
  });
});
