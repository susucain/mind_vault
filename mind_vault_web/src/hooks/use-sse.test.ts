import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSse } from './use-sse';
import { setAccessTokenProvider } from '../api/client';
import { setAuthExpiredRedirectHandler, useAuthStore } from '../stores/auth.store';

function streamResponse(chunks: string[], signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  let index = 0;

  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (signal?.aborted || index === chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[index++]));
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('useSse', () => {
  afterEach(() => {
    setAccessTokenProvider(() => undefined);
    setAuthExpiredRedirectHandler(undefined);
    vi.restoreAllMocks();
  });

  it('uses the API URL and authenticated headers from the shared client builder', async () => {
    setAccessTokenProvider(() => 'stream-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(['data: [DONE]\n\n']));
    const { result } = renderHook(() => useSse());

    await act(async () => {
      await result.current.start('/conversations/c1/messages/stream', { onEvent: vi.fn() });
    });

    expect(fetchMock).toHaveBeenCalledWith('/v1/conversations/c1/messages/stream', expect.any(Object));
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer stream-token');
    expect(headers.get('X-Request-ID')).toEqual(expect.any(String));
  });

  it('normalizes a non-OK response and clears auth through the shared 401 handler', async () => {
    setAuthExpiredRedirectHandler(vi.fn());
    useAuthStore.getState().setSession({
      token: 'expired-token',
      user: { id: 'user-1' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() => useSse());

    await expect(
      result.current.start('/conversations/c1/messages/stream', { onEvent: vi.fn() }),
    ).rejects.toMatchObject({ status: 401, code: 'Unauthorized' });

    expect(useAuthStore.getState()).toMatchObject({ token: undefined, user: undefined });
  });

  it('adapts representative chat controller frames without dropping backend stages', async () => {
    // Source: mind_vault_api/src/chat/chat.controller.ts writeEvent() and RagStage values.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponse([
        'event: stage\ndata: {"stage":"preparing"}\n\nevent: stage\ndata: {"stage":"retrieve"}\n\nevent: stage\ndata: {"stage":"answer"}\n\nevent: meta\ndata: {"messageId":"message-1"}\n\nevent: token\ndata: {"text":"Answer"}\n\nevent: done\ndata: {"confidence":0.9}\n\n',
      ]),
    );
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSse());

    await act(async () => {
      await result.current.start('/conversations/c1/messages/stream', { onEvent });
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', backendStage: 'preparing' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', status: 'searching', backendStage: 'retrieve' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', status: 'answering', backendStage: 'answer' }),
    );
    expect(onEvent).toHaveBeenCalledWith({ type: 'message_start', messageId: 'message-1' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'token', content: 'Answer' });
  });

  it('adapts representative interview controller stage and result frames', async () => {
    // Source: mind_vault_api/src/interview/interview.controller.ts openSseStream().
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponse([
        'event: stage\ndata: {"stage":"preparing"}\n\nevent: stage\ndata: {"stage":"retrieving"}\n\nevent: stage\ndata: {"stage":"evaluating"}\n\nevent: stage\ndata: {"stage":"generating"}\n\nevent: result\ndata: {"id":"session-1","question":"Tell me about it"}\n\nevent: done\ndata: {}\n\n',
      ]),
    );
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSse());

    await act(async () => {
      await result.current.start('/interview/sessions/stream', { onEvent });
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', status: 'searching', backendStage: 'retrieving' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', status: 'reranking', backendStage: 'evaluating' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', status: 'answering', backendStage: 'generating' }),
    );
    expect(onEvent).toHaveBeenCalledWith({
      type: 'result',
      result: { id: 'session-1', question: 'Tell me about it' },
    });
  });

  it('parses events split across chunks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponse(['event: token\ndata: {"text":"hel', 'lo"}\n\n']),
    );
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSse());

    await act(async () => {
      await result.current.start('/stream', { onEvent });
    });

    expect(onEvent).toHaveBeenCalledWith({ type: 'token', content: 'hello' });
    expect(result.current.status).toBe('done');
  });

  it('parses multiple frames, DONE sentinels, and continues after malformed data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponse([
        'event: token\ndata: {"text":"one"}\n\ndata: not-json\n\nevent: citation\ndata: {"id":"c1","documentId":"d1","documentName":"A","excerpt":"x","locator":{}}\n\ndata: [DONE]\n\n',
      ]),
    );
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSse());

    await act(async () => {
      await result.current.start('/stream', { onEvent });
    });

    expect(onEvent).toHaveBeenCalledWith({ type: 'token', content: 'one' });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'citation',
        citation: expect.objectContaining({ id: 'c1' }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith({ type: 'done', messageId: '' });
    expect(result.current.error).toMatchObject({ code: 'MALFORMED_SSE' });
  });

  it('aborts without discarding events received before aborting', async () => {
    let releaseSecondChunk: (() => void) | undefined;
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('event: token\ndata: {"text":"kept"}\n\n'));
            void new Promise<void>((resolve) => {
              releaseSecondChunk = () => {
                controller.enqueue(encoder.encode('event: token\ndata: {"text":"lost"}\n\n'));
                controller.close();
                resolve();
              };
            });
          },
        }),
        { status: 200 },
      ),
    );
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSse());

    let pending: Promise<void>;
    act(() => {
      pending = result.current.start('/stream', { onEvent });
    });
    await vi.waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith({ type: 'token', content: 'kept' }),
    );
    act(() => result.current.abort());
    releaseSecondChunk?.();
    await act(async () => {
      await pending!;
    });

    expect(onEvent).not.toHaveBeenCalledWith({ type: 'token', content: 'lost' });
    expect(result.current.status).toBe('aborted');
  });
});
