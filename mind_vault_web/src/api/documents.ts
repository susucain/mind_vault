import { jsonRequest, request } from './client';
import { appConfig } from '../lib/config';
import { ApiRequestError } from '../lib/errors';
import type { PageResult } from '../types/api';
import type { Document } from '../types/domain';

export interface DocumentQuery {
  title?: string;
  datasetId?: string;
  categoryId?: string;
  teamId?: string;
  authorId?: string;
  status?: number;
  page?: number;
  pageSize?: number;
}

export interface UploadDocumentInput {
  datasetId: string;
  tags?: string;
  remark?: string;
}

export interface UploadDocumentResult {
  documentId: string;
  jobId: string;
  status: string;
}

export interface DocumentProcessingStatus {
  status: string;
  currentStage?: string | null;
  errorMessage?: string | null;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}

export const listDocuments = (query: DocumentQuery = {}) =>
  request<PageResult<Document>>(`/documents?${queryString(query)}`);
export const getDocument = (id: string) => request<Document>(`/documents/${id}`);
export const getDocumentStatus = (id: string) =>
  request<DocumentProcessingStatus>(`/documents/${id}/status`);
export const retryDocument = (id: string) => jsonRequest<Document>(`/documents/${id}/retry`, 'POST');
export const reindexDocument = (id: string) => jsonRequest<Document>(`/documents/${id}/reindex`, 'POST');
export const deleteDocument = (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' });

export async function uploadDocument(
  file: File,
  input: UploadDocumentInput,
  signal?: AbortSignal,
): Promise<UploadDocumentResult> {
  const body = new FormData();
  body.append('file', file);
  body.append('datasetId', input.datasetId);
  if (input.tags) body.append('tags', input.tags);
  if (input.remark) body.append('remark', input.remark);
  body.append('sourceFileName', file.name);
  return request<UploadDocumentResult>('/documents/upload', { method: 'POST', body, signal });
}

export interface Folder {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
}

function mockOnly(feature: string): void {
  if (!appConfig.enableMockApi) {
    throw new ApiRequestError({
      status: 501,
      code: 'NOT_IMPLEMENTED',
      message: `${feature} API is not implemented by the backend.`,
    });
  }
}

export async function listFolders(): Promise<Folder[]> {
  mockOnly('Folders');
  return [];
}

export async function listTags(): Promise<Tag[]> {
  mockOnly('Tags');
  return [];
}

export async function archiveDocument(_id: string): Promise<void> {
  void _id;
  mockOnly('Archive');
}

export async function restoreArchivedDocument(_id: string): Promise<void> {
  void _id;
  mockOnly('Archive');
}
