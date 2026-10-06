import { jsonRequest, request, type RequestOptions } from './client';
import { appConfig } from '../lib/config';
import type { PageResult } from '../types/api';
import type { ChatMessage, Conversation } from '../types/domain';

export interface ConversationQuery {
  /** 关键词：同时匹配会话标题与消息正文 */
  q?: string;
  page?: number;
  pageSize?: number;
}

const mockConversations: Conversation[] = [
  { id: 'mock-c1', title: '系统设计资料问答', datasetIds: ['mock-d1'], createdAt: '2026-09-29', updatedAt: '2026-09-30' },
  { id: 'mock-c2', title: 'React 性能复盘', datasetIds: ['mock-d2'], createdAt: '2026-09-28', updatedAt: '2026-09-29' },
];

function mockListConversations(query: ConversationQuery): PageResult<Conversation> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const keyword = query.q?.trim().toLowerCase();
  const filtered = keyword
    ? mockConversations.filter((item) => item.title.toLowerCase().includes(keyword))
    : mockConversations;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return { items, total: filtered.length, page, pageSize, hasNext: start + items.length < filtered.length };
}

export async function listConversations(query: ConversationQuery = {}): Promise<PageResult<Conversation>> {
  if (appConfig.enableMockApi) return mockListConversations(query);
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const search = params.toString();
  return request<PageResult<Conversation>>(`/conversations${search ? `?${search}` : ''}`);
}

export const getConversation = (id: string) => request<Conversation>(`/conversations/${id}`);
export const createConversation = (input: { datasetIds: string[]; title?: string }) =>
  jsonRequest<Conversation>('/conversations', 'POST', input);
/** 空数组表示「全部资料集」 */
export const updateConversation = (id: string, datasetIds: string[]) =>
  jsonRequest<Conversation>(`/conversations/${id}`, 'PATCH', { datasetIds });
type BackendCitation = ChatMessage['citations'][number] & { quote?: string };
type BackendMessage = Omit<ChatMessage, 'citations'> & { citations?: BackendCitation[] };

function normalizeMessage(message: BackendMessage): ChatMessage {
  return {
    ...message,
    citations: (message.citations ?? []).map((citation) => ({
      ...citation,
      documentName: citation.documentName || citation.documentId,
      excerpt: citation.excerpt || citation.quote || '',
    })),
  };
}

export async function listMessages(id: string): Promise<ChatMessage[]> {
  const response = await request<ChatMessage[] | { items: ChatMessage[] }>(`/conversations/${id}/messages`);
  return (Array.isArray(response) ? response : response.items).map(normalizeMessage);
}
export const createMessage = (id: string, content: string) =>
  jsonRequest<ChatMessage>(`/conversations/${id}/messages`, 'POST', { content });
export const streamMessagesPath = (id: string) => `/conversations/${id}/messages/stream`;
export const createMessageStreamRequest = (id: string, content: string) => ({
  path: streamMessagesPath(id),
  init: {
    method: 'POST',
    body: { content },
  } satisfies RequestOptions,
});
