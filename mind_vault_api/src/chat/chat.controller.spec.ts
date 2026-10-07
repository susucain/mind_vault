jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));
jest.mock('../auth/current-user.decorator', () => ({
  CurrentUser: () => () => undefined,
}));
jest.mock('../common/guards/rate-limit.guard', () => ({
  RateLimitGuard: class RateLimitGuard {},
}));

import { ChatController } from './chat.controller';

function buildResponse() {
  const events: string[] = [];
  const headers = new Map<string, string>();
  let closeHandler: (() => void) | undefined;
  const response = {
    writableEnded: false,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => {
      events.push(chunk);
      return true;
    }),
    end: jest.fn(() => {
      response.writableEnded = true;
    }),
    once: jest.fn((_event: string, handler: () => void) => {
      closeHandler = handler;
      return response;
    }),
  };
  return {
    response,
    events,
    headers,
    getCloseHandler: () => closeHandler,
  };
}

describe('ChatController.stream', () => {
  it('writes a processing stage and completes the existing SSE protocol', async () => {
    const { response, events, headers, getCloseHandler } = buildResponse();
    // 真流式：后端在生成过程中回调，controller 必须即时转发
    const answer = (
      _userId: string,
      _conversationId: string,
      _question: string,
      options: {
        onMessageStart?: (message: { id: string }) => void;
        onToken?: (text: string) => void;
      },
    ) => {
      options.onMessageStart?.({ id: 'm1' });
      options.onToken?.('# Answer');
      return Promise.resolve({
        message: {
          id: 'm1',
          usedTools: ['vector'],
          model: 'fast-model',
          thinking: false,
          content: '# Answer',
        },
        answerMode: 'rag',
        citations: [],
        suggestions: [],
      });
    };
    const chat = { ask: jest.fn(answer) };
    const controller = new ChatController(chat as never);

    await controller.stream(
      { id: 'u1' },
      'c1',
      { content: 'question' },
      response as never,
    );

    expect(headers.get('Content-Type')).toBe(
      'text/event-stream; charset=utf-8',
    );
    expect(headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(headers.get('X-Accel-Buffering')).toBe('no');
    expect(response.flushHeaders).toHaveBeenCalled();
    expect(events.map((event) => event.match(/^event: (\w+)/)?.[1])).toEqual([
      'stage',
      'meta',
      'token',
      'done',
    ]);
    expect(response.end).toHaveBeenCalled();
    expect(getCloseHandler()).toBeDefined();
  });

  it('forwards the resolved document name in citation events', async () => {
    const { response, events } = buildResponse();
    const chat = {
      ask: jest.fn().mockResolvedValue({
        message: { id: 'm1' },
        answerMode: 'rag',
        citations: [
          {
            id: 'cite_1',
            documentId: 'doc_1',
            documentName: '系统设计手册',
            quote: '片段',
            rank: 0,
          },
        ],
        suggestions: [],
      }),
    };
    const controller = new ChatController(chat as never);

    await controller.stream(
      { id: 'u1' },
      'c1',
      { content: 'question' },
      response as never,
    );

    expect(events.map((event) => event.match(/^event: (\w+)/)?.[1])).toEqual([
      'stage',
      'citation',
      'done',
    ]);
    expect(events[1]).toContain('"documentName":"系统设计手册"');
  });

  it('emits the follow-up suggestions between citations and done', async () => {
    const { response, events } = buildResponse();
    const chat = {
      ask: jest.fn().mockResolvedValue({
        message: { id: 'm1' },
        answerMode: 'rag',
        citations: [],
        suggestions: ['那它的缺点呢', '还有别的方案吗', '怎么落地'],
      }),
    };
    const controller = new ChatController(chat as never);

    await controller.stream(
      { id: 'u1' },
      'c1',
      { content: 'question' },
      response as never,
    );

    expect(events.map((event) => event.match(/^event: (\w+)/)?.[1])).toEqual([
      'stage',
      'suggestions',
      'done',
    ]);
    expect(events[1]).toContain('"items":["那它的缺点呢"');
  });

  it('keeps the stream silent about suggestions when the switch is off', async () => {
    const { response, events } = buildResponse();
    const chat = {
      ask: jest.fn().mockResolvedValue({
        message: { id: 'm1' },
        answerMode: 'rag',
        citations: [],
        suggestions: [],
      }),
    };
    const controller = new ChatController(chat as never);

    await controller.stream(
      { id: 'u1' },
      'c1',
      { content: 'question' },
      response as never,
    );

    // 不下发空数组，前端直接按静态引导渲染
    expect(events.map((event) => event.match(/^event: (\w+)/)?.[1])).toEqual([
      'stage',
      'done',
    ]);
  });
});

describe('ChatController.update', () => {
  it('forwards the partial conversation patch to the service', async () => {
    const chat = {
      updateConversation: jest.fn().mockResolvedValue({ id: 'c1', favorite: true }),
    };
    const controller = new ChatController(chat as never);

    const result = await controller.update({ id: 'u1' }, 'c1', { favorite: true });

    expect(chat.updateConversation).toHaveBeenCalledWith('u1', 'c1', {
      favorite: true,
    });
    expect(result).toEqual({ id: 'c1', favorite: true });
  });
});
