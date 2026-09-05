import { Dataset, PaginatedResponse } from '../types/api';
import { request } from './request';

export function listDatasets() {
  return request<PaginatedResponse<Dataset>>({
    path: '/datasets?page=1&pageSize=100',
  });
}

export function createDataset(input: { name: string; description?: string }) {
  return request<Dataset, typeof input>({
    path: '/datasets',
    method: 'POST',
    data: input,
  });
}
