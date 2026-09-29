import { jsonRequest, request } from './client';
import type { ChatMessage, Conversation } from '../types/domain';

export const listConversations = () => request<Conversation[]>('/conversations');
export const createConversation = (input: { datasetIds: string[]; title?: string }) =>
  jsonRequest<Conversation>('/conversations', 'POST', input);
export const updateConversation = (id: string, datasetIds: string[]) =>
  jsonRequest<Conversation>(`/conversations/${id}`, 'PATCH', { datasetIds });
export const listMessages = (id: string) => request<ChatMessage[]>(`/conversations/${id}/messages`);
export const createMessage = (id: string, content: string) =>
  jsonRequest<ChatMessage>(`/conversations/${id}/messages`, 'POST', { content });
export const streamMessagesPath = (id: string) => `/conversations/${id}/messages/stream`;
