import { DocumentItem, PaginatedResponse } from '../types/api';
import { request } from './request';

export interface DocumentDetail extends DocumentItem {
  content: string;
}

export function listDocuments(datasetId?: string) {
  const query = datasetId
    ? `?datasetId=${encodeURIComponent(datasetId)}&page=1&pageSize=100`
    : '?page=1&pageSize=100';
  return request<PaginatedResponse<DocumentItem>>({
    path: `/documents${query}`,
  });
}

export function getDocument(id: string) {
  return request<DocumentDetail>({
    path: `/documents/${id}`,
  });
}

export function deleteDocument(id: string) {
  return request<{
    documentId: string;
    jobId: string;
    status: 'DELETING';
  }>({
    path: `/documents/${id}`,
    method: 'DELETE',
  });
}
