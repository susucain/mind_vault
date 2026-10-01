import { jsonRequest, request } from './client';
import { appConfig } from '../lib/config';
import type { PageResult } from '../types/api';
import type { Dataset } from '../types/domain';

export interface DatasetInput {
  name: string;
  description?: string;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}

let mockDatasets: Dataset[] = [
  { id: 'mock-d1', name: '面试准备', description: '系统设计与项目经历', documentCount: 8, createdAt: '2026-09-01', updatedAt: '2026-09-29' },
  { id: 'mock-d2', name: '技术资料', description: '日常检索资料', documentCount: 14, createdAt: '2026-09-01', updatedAt: '2026-09-28' },
];

export async function listDatasets(query: { name?: string; page?: number; pageSize?: number } = {}): Promise<PageResult<Dataset>> {
  if (!appConfig.enableMockApi) return request<PageResult<Dataset>>(`/datasets?${queryString(query)}`);
  const items = query.name ? mockDatasets.filter((item) => item.name.includes(query.name!)) : mockDatasets;
  return { items, total: items.length, page: query.page ?? 1, pageSize: query.pageSize ?? 20 };
}

export async function getDataset(id: string): Promise<Dataset> {
  if (!appConfig.enableMockApi) return request<Dataset>(`/datasets/${id}`);
  const dataset = mockDatasets.find((item) => item.id === id);
  if (!dataset) throw new Error('Dataset not found');
  return dataset;
}

export async function createDataset(input: DatasetInput): Promise<Dataset> {
  if (!appConfig.enableMockApi) return jsonRequest<Dataset>('/datasets', 'POST', input);
  const dataset: Dataset = {
    id: `mock-${Date.now()}`,
    ...input,
    documentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockDatasets = [dataset, ...mockDatasets];
  return dataset;
}

export async function updateDataset(id: string, input: DatasetInput): Promise<Dataset> {
  if (!appConfig.enableMockApi) return jsonRequest<Dataset>(`/datasets/${id}`, 'PATCH', input);
  const current = await getDataset(id);
  const next = { ...current, ...input, updatedAt: new Date().toISOString() };
  mockDatasets = mockDatasets.map((item) => item.id === id ? next : item);
  return next;
}

export async function deleteDataset(id: string): Promise<void> {
  if (!appConfig.enableMockApi) return request<void>(`/datasets/${id}`, { method: 'DELETE' });
  mockDatasets = mockDatasets.filter((item) => item.id !== id);
}
