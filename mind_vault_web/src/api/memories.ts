import { jsonRequest, request } from './client';

export interface Memory {
  id: string;
  content: string;
  kind: 'preference' | 'fact' | 'goal';
  status: 'ACTIVE' | 'SUPERSEDED';
}

export const listMemories = (status?: Memory['status']) =>
  request<Memory[]>(`/memories${status ? `?status=${status}` : ''}`);
export const createMemory = (input: Pick<Memory, 'content' | 'kind'> & { sourceConversationId?: string }) =>
  jsonRequest<Memory>('/memories', 'POST', input);
export const updateMemory = (id: string, input: Partial<Pick<Memory, 'content' | 'kind' | 'status'>>) =>
  jsonRequest<Memory>(`/memories/${id}`, 'PATCH', input);
export const deleteMemory = (id: string) => request<void>(`/memories/${id}`, { method: 'DELETE' });
export const clearMemories = () => request<void>('/memories', { method: 'DELETE' });
