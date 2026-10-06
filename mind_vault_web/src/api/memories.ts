import { jsonRequest, request } from './client';

export type MemoryKind = 'preference' | 'fact' | 'goal';
export type MemoryStatus = 'ACTIVE' | 'SUPERSEDED';

export interface Memory {
  id: string;
  content: string;
  kind: MemoryKind;
  status: MemoryStatus;
  /** 被问答链路召回并注入提示词的次数 */
  hitCount: number;
  lastUsedAt: string | null;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQuery {
  status?: MemoryStatus;
  kind?: MemoryKind;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface MemoryPage {
  items: Memory[];
  total: number;
  /** 后端未收到分页参数时返回全量并回 pageSize = null（小程序依赖此行为） */
  page: number;
  pageSize: number | null;
}

export interface MemoryStats {
  active: number;
  superseded: number;
  total: number;
  /** 只统计生效中的条目，与 active 求和对齐 */
  byKind: Record<MemoryKind, number>;
  hitTotal: number;
  maxActive: number;
  atCapacity: boolean;
}

export interface MemoryInput {
  content: string;
  kind: MemoryKind;
  sourceConversationId?: string;
}

export interface MemoryPatch {
  content?: string;
  kind?: MemoryKind;
  status?: MemoryStatus;
}

/** 空串与 undefined 都不下发：后端把 `?q=` 视作未传，前端也没必要多拼一个空参数 */
function queryString(query: MemoryQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  return params.toString();
}

export const listMemories = (query: MemoryQuery = {}) => {
  const search = queryString(query);
  return request<MemoryPage>(`/memories${search ? `?${search}` : ''}`);
};

export const getMemoryStats = () => request<MemoryStats>('/memories/stats');

export const createMemory = (input: MemoryInput) =>
  jsonRequest<Memory>('/memories', 'POST', input);

export const updateMemory = (id: string, patch: MemoryPatch) =>
  jsonRequest<Memory>(`/memories/${id}`, 'PATCH', patch);

export const deleteMemory = (id: string) =>
  request<{ id: string; deleted: boolean }>(`/memories/${id}`, { method: 'DELETE' });

export const clearMemories = () =>
  request<{ deleted: number }>('/memories', { method: 'DELETE' });