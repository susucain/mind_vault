import { environment } from '../config/env';
import { ChatMessage, ChatStreamMeta, Conversation } from '../types/chat';
import { request } from './request';
import { loadSession } from '../utils/session';
import { SseEvent, SseParser } from '../utils/sse';
import { recordRequestTrace } from '../utils/telemetry';

export function createConversation(input: {
  title?: string;
  datasetIds: string[];
}) {
  return request<Conversation, typeof input>({
    path: '/conversations',
    method: 'POST',
    data: input,
  });
}

export function listConversations() {
  return request<{ items: Conversation[] }>({
    path: '/conversations',
  });
}

export function listMessages(conversationId: string) {
  return request<{ items: ChatMessage[] }>({
    path: `/conversations/${conversationId}/messages`,
  });
}

export function streamMessage(
  conversationId: string,
  content: string,
  onEvent: (event: SseEvent) => void
) {
  const session = loadSession();
  if (!session) return Promise.reject(new Error('登录已失效'));
  const startedAt = Date.now();
  const path = `/conversations/${conversationId}/messages/stream`;
  // meta 在流式过程中到达，请求结束回调里才写记录，所以先攒着
  let lastMeta: ChatStreamMeta | null = null;
  const handleEvent = (event: SseEvent) => {
    if (event.event === 'meta' && isMetaEvent(event.data)) {
      lastMeta = event.data;
    }
    onEvent(event);
  };
  const streamUsage = () => ({
    usedTools: lastMeta?.usedTools,
    answerMode: lastMeta?.answerMode,
  });

  return new Promise<void>((resolve, reject) => {
    const parser = new SseParser();
    const task = wx.request({
      url: `${environment.apiBaseUrl}${path}`,
      timeout: environment.streamTimeout,
      method: 'POST',
      enableChunked: true,
      dataType: 'other',
      data: { content },
      header: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`问答请求失败：${response.statusCode}`);
          recordRequestTrace({
            timestamp: Date.now(),
            method: 'POST',
            path,
            durationMs: Date.now() - startedAt,
            statusCode: response.statusCode,
            error: error.message,
            ...streamUsage(),
          });
          reject(error);
          return;
        }
        recordRequestTrace({
          timestamp: Date.now(),
          method: 'POST',
          path,
          durationMs: Date.now() - startedAt,
          statusCode: response.statusCode,
          ...streamUsage(),
        });
        resolve();
      },
      fail(error) {
        const streamError = new Error(error.errMsg || '问答连接失败');
        recordRequestTrace({
          timestamp: Date.now(),
          method: 'POST',
          path,
          durationMs: Date.now() - startedAt,
          error: streamError.message,
          ...streamUsage(),
        });
        reject(streamError);
      },
    });
    task.onChunkReceived((chunk) => {
      for (const event of parser.push(chunk.data)) {
        handleEvent(event);
      }
    });
  });
}

export function isMetaEvent(
  data: Record<string, unknown>
): data is ChatStreamMeta {
  return (
    typeof data.messageId === 'string' &&
    Array.isArray(data.usedTools) &&
    typeof data.thinking === 'boolean'
  );
}
