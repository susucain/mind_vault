import { useCallback, useRef, useState } from 'react';
import { buildRequest } from '../api/client';
import type { Citation } from '../types/domain';

export type StreamEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'token'; content: string }
  | { type: 'citation'; citation: Citation }
  | { type: 'status'; status: 'searching' | 'reranking' | 'answering' }
  | { type: 'done'; messageId: string }
  | { type: 'error'; code: string; message: string };

export interface SseStartOptions {
  init?: RequestInit;
  onEvent: (event: StreamEvent) => void;
}

type SseStatus = 'idle' | 'streaming' | 'done' | 'aborted' | 'error';

function normalize(eventName: string, payload: unknown): StreamEvent | undefined {
  const data = payload as Record<string, unknown>;
  if (eventName === 'message' && typeof data.type === 'string') {
    return normalize(data.type, payload);
  }
  switch (eventName) {
    case 'meta':
    case 'message_start':
      return { type: 'message_start', messageId: String(data.messageId ?? data.id ?? '') };
    case 'token':
      return { type: 'token', content: String(data.text ?? data.content ?? '') };
    case 'citation':
      return { type: 'citation', citation: payload as Citation };
    case 'status':
    case 'stage': {
      const status = String(data.status ?? data.stage ?? '');
      return status === 'searching' || status === 'reranking' || status === 'answering'
        ? { type: 'status', status }
        : undefined;
    }
    case 'done':
      return { type: 'done', messageId: String(data.messageId ?? '') };
    case 'error':
      return { type: 'error', code: String(data.code ?? 'STREAM_ERROR'), message: String(data.message ?? 'Stream failed') };
    default:
      return undefined;
  }
}

export function useSse() {
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const [status, setStatus] = useState<SseStatus>('idle');
  const [error, setError] = useState<StreamEvent & { type: 'error' }>();

  const abort = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const start = useCallback(async (path: string, options: SseStartOptions): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('streaming');
    setError(undefined);

    try {
      const built = buildRequest(path, { ...options.init, signal: controller.signal });
      const response = await fetch(built.url, built.init);
      if (!response.ok) throw new Error(`Stream request failed (${response.status})`);
      if (!response.body) throw new Error('Stream response has no body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let stopped = false;

      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          if (controller.signal.aborted) break;
          const lines = frame.split(/\r?\n/);
          const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
          const rawData = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!rawData || rawData === '[DONE]') {
            options.onEvent({ type: 'done', messageId: '' });
            stopped = true;
            break;
          }
          try {
            const event = normalize(eventName, JSON.parse(rawData));
            if (event) options.onEvent(event);
          } catch {
            const malformed = { type: 'error', code: 'MALFORMED_SSE', message: 'Malformed SSE JSON payload' } as const;
            setError(malformed);
            options.onEvent(malformed);
          }
        }
      }
      setStatus(controller.signal.aborted ? 'aborted' : 'done');
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus('aborted');
        return;
      }
      const streamError = {
        type: 'error' as const,
        code: 'STREAM_ERROR',
        message: caught instanceof Error ? caught.message : 'Stream failed',
      };
      setError(streamError);
      options.onEvent(streamError);
      setStatus('error');
    } finally {
      if (controllerRef.current === controller) controllerRef.current = undefined;
    }
  }, []);

  return { start, abort, status, error };
}
