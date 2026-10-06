import { jsonRequest, request } from './client';
import { appConfig } from '../lib/config';
import type { SearchHistoryEntry } from '../types/domain';

export interface SearchHistoryListResponse {
  items: SearchHistoryEntry[];
}

/** 检索历史按 ownerId 隔离，由服务端存储；前端只读、只删，写入由检索接口自动完成。 */
export async function listSearchHistory(limit = 20): Promise<SearchHistoryListResponse> {
  if (appConfig.enableMockApi) return { items: [] };
  return request<SearchHistoryListResponse>(`/search-history?limit=${limit}`);
}

export async function deleteSearchHistory(id: string): Promise<{ deleted: number }> {
  if (appConfig.enableMockApi) return { deleted: 1 };
  return jsonRequest<{ deleted: number }>(`/search-history/${id}`, 'DELETE');
}

export async function clearSearchHistory(): Promise<{ deleted: number }> {
  if (appConfig.enableMockApi) return { deleted: 0 };
  return jsonRequest<{ deleted: number }>('/search-history', 'DELETE');
}
