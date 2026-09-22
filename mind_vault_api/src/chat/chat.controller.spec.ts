jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));
jest.mock('../auth/current-user.decorator', () => ({
  CurrentUser: () => () => undefined,
}));
jest.mock('../common/guards/rate-limit.guard', () => ({
  RateLimitGuard: class RateLimitGuard {},
}));

import { ChatController } from './chat.controller';

describe('ChatController.stream', () => {
  it('writes a processing stage and completes the existing SSE protocol', async () => {
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
    const chat = {
      ask: jest.fn().mockResolvedValue({
        message: {
          id: 'm1',
          usedTools: ['vector'],
          model: 'fast-model',
          thinking: false,
          content: '# Answer',
          confidence: 0.9,
        },
        answerMode: 'rag',
        citations: [],
      }),
    };
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
    expect(closeHandler).toBeDefined();
  });
});
