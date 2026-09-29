import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSse } from './use-sse';

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
  afterEach(() => vi.restoreAllMocks());

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
