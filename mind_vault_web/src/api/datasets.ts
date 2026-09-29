import { jsonRequest, request } from './client';
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

export const listDatasets = (query: { name?: string; page?: number; pageSize?: number } = {}) =>
  request<PageResult<Dataset>>(`/datasets?${queryString(query)}`);
export const getDataset = (id: string) => request<Dataset>(`/datasets/${id}`);
export const createDataset = (input: DatasetInput) => jsonRequest<Dataset>('/datasets', 'POST', input);
export const updateDataset = (id: string, input: DatasetInput) =>
  jsonRequest<Dataset>(`/datasets/${id}`, 'PATCH', input);
export const deleteDataset = (id: string) => request<void>(`/datasets/${id}`, { method: 'DELETE' });
