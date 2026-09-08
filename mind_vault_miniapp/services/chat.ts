import { environment } from '../config/env';
import { ChatMessage, ChatStreamMeta, Conversation } from '../types/chat';
import { request } from './request';
import { loadSession } from '../utils/session';
import { SseEvent, SseParser } from '../utils/sse';

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

  return new Promise<void>((resolve, reject) => {
    const parser = new SseParser();
    const task = wx.request({
      url: `${environment.apiBaseUrl}/conversations/${conversationId}/messages/stream`,
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
          reject(new Error(`问答请求失败：${response.statusCode}`));
          return;
        }
        resolve();
      },
      fail(error) {
        reject(new Error(error.errMsg || '问答连接失败'));
      },
    });
    task.onChunkReceived((chunk) => {
      for (const event of parser.push(chunk.data)) {
        onEvent(event);
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
