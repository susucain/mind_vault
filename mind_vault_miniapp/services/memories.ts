import {
  ClearMemoriesResponse,
  ListMemoriesResponse,
  MemoryItem,
  MemoryKind,
  MemoryStatus,
} from '../types/memory';
import { request } from './request';

export function listMemories(status: MemoryStatus) {
  return request<ListMemoriesResponse>({ path: `/memories?status=${status}` });
}

export function createMemory(input: { content: string; kind: MemoryKind }) {
  return request<MemoryItem, typeof input>({
    path: '/memories',
    method: 'POST',
    data: input,
  });
}

export function updateMemory(
  id: string,
  input: { content?: string; kind?: MemoryKind; status?: MemoryStatus }
) {
  return request<MemoryItem, typeof input>({
    path: `/memories/${id}`,
    method: 'PATCH',
    data: input,
  });
}

export function deleteMemory(id: string) {
  return request<{ id: string; deleted: boolean }>({
    path: `/memories/${id}`,
    method: 'DELETE',
  });
}

export function clearMemories() {
  return request<ClearMemoriesResponse>({
    path: '/memories',
    method: 'DELETE',
  });
}
