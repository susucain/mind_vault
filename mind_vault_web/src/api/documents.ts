import { jsonRequest, request } from './client';
import { appConfig } from '../lib/config';
import { ApiRequestError } from '../lib/errors';
import type { PageResult } from '../types/api';
import type { Document, DocumentSection } from '../types/domain';

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
  documentId: string;
  jobId: string;
  status: string;
  currentStage?: string | null;
  retryCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  stageProgress: {
    completed: number;
    total: number;
    percent: number;
    estimatedRemainingSeconds?: number | null;
    stageStartedAt?: string | null;
  };
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
interface BackendDocumentSection extends Omit<DocumentSection, 'content'> {
  text: string;
}

interface BackendDocument extends Omit<Document, 'sections'> {
  sections?: BackendDocumentSection[];
}

function normalizeDocument(document: BackendDocument): Document {
  return {
    ...document,
    sections: document.sections?.map(({ text, ...section }) => ({ ...section, content: text })),
  };
}

export async function getDocument(id: string): Promise<Document> {
  const document = await request<BackendDocument>(`/documents/${id}`);
  return normalizeDocument(document);
}
export const getDocumentStatus = (id: string) =>
  request<DocumentProcessingStatus>(`/documents/${id}/status`);
export const retryDocument = (id: string) => jsonRequest<Document>(`/documents/${id}/retry`, 'POST');
export const reindexDocument = (id: string) => jsonRequest<Document>(`/documents/${id}/reindex`, 'POST');
export const deleteDocument = (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' });

export async function uploadDocument(
  file: File,
  input: UploadDocumentInput,
  options: { signal?: AbortSignal } = {},
): Promise<UploadDocumentResult> {
  const body = new FormData();
  body.append('file', file);
  body.append('datasetId', input.datasetId);
  if (input.tags) body.append('tags', input.tags);
  if (input.remark) body.append('remark', input.remark);
  body.append('sourceFileName', file.name);
  return request<UploadDocumentResult>('/documents/upload', { method: 'POST', body, signal: options.signal });
}

export interface Folder {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface ArchivedDocument {
  id: string;
  title: string;
  sourceFileExtension?: string | null;
  archivedAt: string;
}

export interface LibraryItemInput {
  name: string;
}

let mockFolders: Folder[] = [
  { id: 'mock-folder-1', name: '求职准备' },
  { id: 'mock-folder-2', name: '项目资料' },
];
let mockTags: Tag[] = [
  { id: 'mock-tag-1', name: '系统设计' },
  { id: 'mock-tag-2', name: '待复习' },
];
let mockArchivedDocuments: ArchivedDocument[] = [
  { id: 'mock-archived-1', title: '历史项目总结', sourceFileExtension: 'pdf', archivedAt: '2026-09-18' },
];
let nextMockId = 1;

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
  return [...mockFolders];
}

export async function createFolder(input: LibraryItemInput): Promise<Folder> {
  mockOnly('Folders');
  const folder = { id: `mock-folder-${Date.now()}-${nextMockId++}`, name: input.name };
  mockFolders = [folder, ...mockFolders];
  return folder;
}

export async function updateFolder(id: string, input: LibraryItemInput): Promise<Folder> {
  mockOnly('Folders');
  const current = mockFolders.find((item) => item.id === id);
  if (!current) throw new Error('Folder not found');
  const folder = { ...current, name: input.name };
  mockFolders = mockFolders.map((item) => item.id === id ? folder : item);
  return folder;
}

export async function deleteFolder(id: string): Promise<void> {
  mockOnly('Folders');
  mockFolders = mockFolders.filter((item) => item.id !== id);
}

export async function listTags(): Promise<Tag[]> {
  mockOnly('Tags');
  return [...mockTags];
}

export async function createTag(input: LibraryItemInput): Promise<Tag> {
  mockOnly('Tags');
  const tag = { id: `mock-tag-${Date.now()}-${nextMockId++}`, name: input.name };
  mockTags = [tag, ...mockTags];
  return tag;
}

export async function updateTag(id: string, input: LibraryItemInput): Promise<Tag> {
  mockOnly('Tags');
  const current = mockTags.find((item) => item.id === id);
  if (!current) throw new Error('Tag not found');
  const tag = { ...current, name: input.name };
  mockTags = mockTags.map((item) => item.id === id ? tag : item);
  return tag;
}

export async function deleteTag(id: string): Promise<void> {
  mockOnly('Tags');
  mockTags = mockTags.filter((item) => item.id !== id);
}

export async function listArchivedDocuments(): Promise<ArchivedDocument[]> {
  mockOnly('Archive');
  return [...mockArchivedDocuments];
}

export async function archiveDocument(
  id: string,
  document: Pick<Document, 'title' | 'sourceFileExtension'> = { title: id },
): Promise<void> {
  mockOnly('Archive');
  if (mockArchivedDocuments.some((item) => item.id === id)) return;
  mockArchivedDocuments = [{
    id,
    title: document.title,
    sourceFileExtension: document.sourceFileExtension,
    archivedAt: new Date().toISOString(),
  }, ...mockArchivedDocuments];
}

export async function restoreArchivedDocument(id: string): Promise<void> {
  mockOnly('Archive');
  mockArchivedDocuments = mockArchivedDocuments.filter((item) => item.id !== id);
}
