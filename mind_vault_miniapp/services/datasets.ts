import { Dataset, PaginatedResponse } from '../types/api';
import { request } from './request';

export function listDatasets(input: { name?: string; pageSize?: number } = {}) {
  const params = [`page=1`, `pageSize=${input.pageSize ?? 20}`];
  if (input.name?.trim()) params.push(`name=${encodeURIComponent(input.name.trim())}`);
  return request<PaginatedResponse<Dataset>>({
    path: `/datasets?${params.join('&')}`,
  });
}

export function createDataset(input: { name: string; description?: string }) {
  return request<Dataset, typeof input>({
    path: '/datasets',
    method: 'POST',
    data: input,
  });
}
