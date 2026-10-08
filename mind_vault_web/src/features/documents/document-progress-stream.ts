import { buildRequest, responseError } from '../../api/client';
import type { DocumentGraphProgress } from '../../types/domain';

/** 与后端 `DocumentProgressEvent` 对齐的进度帧 */
export interface DocumentProgressEvent {
  ownerId: string;
  documentId: string;
  stage: string;
  status: string;
  completed: number;
  total: number;
  percent: number;
  estimatedRemainingSeconds?: number | null;
  graph?: DocumentGraphProgress | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface DocumentProgressHandlers {
  onEvent: (event: DocumentProgressEvent) => void;
  /** 连接建立（响应头到达）时触发：调用方据此暂停兜底轮询 */
  onOpen?: () => void;
  /** 流结束或失败时触发：调用方据此恢复兜底轮询并安排重连 */
  onClose?: (error?: unknown) => void;
}

/**
 * 订阅 owner 级文档进度流（U5）。
 *
 * `EventSource` 不能携带 `Authorization` 头，这里复用问答流同一套
 * fetch + ReadableStream 手写解析：鉴权头由 `buildRequest` 统一注入，
 * 不为文档进度单开一条鉴权通道。服务端每 12s 发一帧 `event: ping` 保活，这里直接忽略。
 *
 * 返回断开函数；连接生命周期（断线重连退避）由调用方决定。
 */
export function connectDocumentProgress(
  handlers: DocumentProgressHandlers,
): () => void {
  const controller = new AbortController();
  let closed = false;

  void (async () => {
    try {
      const built = buildRequest('/documents/events', {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      const response = await fetch(built.url, built.init);
      if (!response.ok) throw await responseError(response);
      if (!response.body) throw new Error('进度流响应缺少 body');
      handlers.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const event = parseProgressFrame(frame);
          if (event) handlers.onEvent(event);
        }
      }
      if (!closed) handlers.onClose?.();
    } catch (error) {
      if (closed || controller.signal.aborted) return;
      handlers.onClose?.(error);
    }
  })();

  return () => {
    closed = true;
    controller.abort();
  };
}

/** 解析单帧 SSE；只认 `progress`（`ping` 心跳与未知事件一律忽略） */
function parseProgressFrame(frame: string): DocumentProgressEvent | undefined {
  const lines = frame.split(/\r?\n/);
  const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
  if (eventName !== 'progress') return undefined;
  const raw = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as DocumentProgressEvent;
    return typeof parsed?.documentId === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}
