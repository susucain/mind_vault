import { jsonRequest, request, type RequestOptions } from './client';
import { appConfig } from '../lib/config';
import type { ChatMessage, Conversation } from '../types/domain';

const mockConversations: Conversation[] = [
  { id: 'mock-c1', title: '系统设计资料问答', datasetIds: ['mock-d1'], createdAt: '2026-09-29', updatedAt: '2026-09-30' },
  { id: 'mock-c2', title: 'React 性能复盘', datasetIds: ['mock-d2'], createdAt: '2026-09-28', updatedAt: '2026-09-29' },
];

export async function listConversations(): Promise<Conversation[]> {
  if (appConfig.enableMockApi) return mockConversations;
  const response = await request<{ items: Conversation[] }>('/conversations');
  return response.items;
}
export const createConversation = (input: { datasetIds: string[]; title?: string }) =>
  jsonRequest<Conversation>('/conversations', 'POST', input);
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
