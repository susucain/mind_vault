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
});
