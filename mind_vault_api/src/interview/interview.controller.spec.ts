jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));
jest.mock('../auth/current-user.decorator', () => ({
  CurrentUser: () => () => undefined,
}));

import { InterviewController } from './interview.controller';

interface MockSseResponse {
  writableEnded: boolean;
  status: jest.Mock;
  setHeader: jest.Mock;
  flushHeaders: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  once: jest.Mock;
}

function buildSseResponse() {
  const events: string[] = [];
  const headers = new Map<string, string>();
  let closeHandler: (() => void) | undefined;
  const response: MockSseResponse = {
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
  return { response, events, headers, getCloseHandler: () => closeHandler };
}

function eventNames(events: string[]) {
  return events.map((event) => event.match(/^event: (\w+)/)?.[1]);
}

describe('InterviewController', () => {
  it('forwards review item pagination query parameters to the service', async () => {
    const result = { items: [], total: 0, page: 2, pageSize: 2 };
    const service = {
      listReviewItems: jest.fn().mockResolvedValue(result),
    };
    const controller = new InterviewController(service as never);
    const query = { status: 'COMPLETED' as const, page: 2, pageSize: 2 };

    await expect(
      controller.listReviewItems({ id: 'user_1' }, query),
    ).resolves.toBe(result);
    expect(service.listReviewItems).toHaveBeenCalledWith('user_1', query);
  });

  it('streams the session creation stages and result over SSE', async () => {
    const { response, events, headers } = buildSseResponse();
    const session = { id: 'session_1' };
    const service = {
      createSession: jest.fn(
        (_ownerId: string, _dto: unknown, onStage?: ReportStage) => {
          onStage?.('retrieving');
          onStage?.('generating');
          return session;
        },
      ),
    };
    const controller = new InterviewController(service as never);

    await controller.createSessionStream(
      { id: 'user_1' },
      { datasetId: 'dataset_1' } as never,
      response as never,
    );

    expect(headers.get('Content-Type')).toBe(
      'text/event-stream; charset=utf-8',
    );
    expect(headers.get('X-Accel-Buffering')).toBe('no');
    // preparing 由控制器立刻发出，保证前端在检索前就先有反馈
    expect(eventNames(events)).toEqual([
      'stage',
      'stage',
      'stage',
      'result',
      'done',
    ]);
    expect(events[3]).toContain('session_1');
    expect(response.end).toHaveBeenCalled();
  });

  it('reports a rejected answer submission as an SSE error event', async () => {
    const { response, events } = buildSseResponse();
    const service = {
      submitAnswer: jest
        .fn()
        .mockRejectedValue(new Error('当前训练会话不可提交回答')),
    };
    const controller = new InterviewController(service as never);

    await controller.submitAnswerStream(
      { id: 'user_1' },
      'session_1',
      { answer: '使用重试队列。' },
      response as never,
    );

    expect(eventNames(events)).toEqual(['stage', 'error']);
    expect(events[1]).toContain('当前训练会话不可提交回答');
    expect(response.end).toHaveBeenCalled();
  });

  it('drops later stages once the client has disconnected', async () => {
    const { response, events, getCloseHandler } = buildSseResponse();
    const service = {
      createSession: jest.fn(
        (_ownerId: string, _dto: unknown, onStage?: ReportStage) => {
          getCloseHandler()?.();
          onStage?.('generating');
          return { id: 'session_1' };
        },
      ),
    };
    const controller = new InterviewController(service as never);

    await controller.createSessionStream(
      { id: 'user_1' },
      { datasetId: 'dataset_1' } as never,
      response as never,
    );

    // 断开后不再写事件，但请求继续跑完并落库
    expect(eventNames(events)).toEqual(['stage']);
    expect(events[0]).toContain('preparing');
    expect(response.end).toHaveBeenCalled();
  });
});

type ReportStage = (stage: 'retrieving' | 'generating' | 'evaluating') => void;
