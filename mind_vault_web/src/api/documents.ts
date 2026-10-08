import { buildRequest, jsonRequest, request, responseError } from './client';
import { appConfig } from '../lib/config';
import { ApiRequestError } from '../lib/errors';
import type { PageResult } from '../types/api';
import type { Document, DocumentGraphProgress, DocumentOutline, DocumentSection, DocumentSectionPage } from '../types/domain';

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
  /** 是否为该文档构建知识图谱，默认关闭 */
  graphEnabled?: boolean;
}

export interface UploadDocumentResult {
  documentId: string;
  jobId: string;
  status: string;
}

/** 服务端当前可上传的扩展名（老格式取决于服务端 soffice 是否可用） */
export interface SupportedFormats {
  extensions: string[];
}

export interface DocumentProcessingStatus {
  documentId: string;
  jobId: string;
  status: string;
  currentStage?: string | null;
  retryCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  /** 是否已开启图谱构建；未开启时 `graph` 为 null（用于区分「未启用」与「已启用未开始」） */
  graphEnabled?: boolean;
  graph?: DocumentGraphProgress | null;
  stageProgress: {
    completed: number;
    total: number;
    percent: number;
    estimatedRemainingSeconds?: number | null;
    stageStartedAt?: string | null;
  };
}

export interface BuildDocumentGraphResult {
  documentId: string;
  graphEnabled: boolean;
  totalChunks: number;
  graph?: DocumentGraphProgress | null;
}

export interface RetryDocumentResult {
  documentId: string;
  jobId: string;
  status: string;
  retryCount: number;
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

/** 后端以 `text` 返回正文，前端统一归一化为 `content`。 */
function normalizeSection({ text, ...section }: BackendDocumentSection): DocumentSection {
  return { ...section, content: text };
}

function normalizeDocument(document: BackendDocument): Document {
  return {
    ...document,
    sections: document.sections?.map(normalizeSection),
  };
}

export async function getDocument(id: string): Promise<Document> {
  const document = await request<BackendDocument>(`/documents/${id}`);
  return normalizeDocument(document);
}

/** 正文分页入参：`cursor` 为上一页最后一块的 order，省略表示从首块开始。 */
export interface DocumentSectionPageParam {
  cursor?: number;
  limit?: number;
}

export const getDocumentOutline = (id: string) =>
  request<DocumentOutline>(`/documents/${id}/outline`);

export async function getDocumentSections(
  id: string,
  param: DocumentSectionPageParam = {},
): Promise<DocumentSectionPage> {
  const query = queryString(param);
  const page = await request<{
    items: BackendDocumentSection[];
    nextCursor: number | null;
    total: number;
  }>(`/documents/${id}/sections${query ? `?${query}` : ''}`);
  return { ...page, items: page.items.map(normalizeSection) };
}
/**
 * 读取正文引用的只读资产（PDF 插图等）。
 * `<img src>` 无法携带 Bearer 令牌，故由调用方取回 Blob 后再转 object URL 渲染。
 */
export async function fetchDocumentAsset(key: string): Promise<Blob> {
  const built = buildRequest(`/documents/assets?${queryString({ key })}`);
  let response: Response;
  try {
    response = await fetch(built.url, built.init);
  } catch (error) {
    throw new ApiRequestError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Asset request failed',
    });
  }
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export const getDocumentStatus = (id: string) =>
  request<DocumentProcessingStatus>(`/documents/${id}/status`);
/** 可上传格式清单：前端不再硬编码白名单，统一由服务端下发 */
export const getSupportedFormats = () =>
  request<SupportedFormats>('/documents/supported-formats');
export const retryDocument = (id: string) =>
  jsonRequest<RetryDocumentResult>(`/documents/${id}/retry`, 'POST');
export const reindexDocument = (id: string) => jsonRequest<Document>(`/documents/${id}/reindex`, 'POST');
/** 事后补建知识图谱：仅对已处理完成、已有分块的文档有效（幂等） */
export const buildDocumentGraph = (id: string) =>
  jsonRequest<BuildDocumentGraphResult>(`/documents/${id}/graph`, 'POST');
export const deleteDocument = (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' });

export async function uploadDocument(
  file: File,
  input: UploadDocumentInput,
  options: { signal?: AbortSignal; idempotencyKey?: string } = {},
): Promise<UploadDocumentResult> {
  const body = new FormData();
  body.append('file', file);
  body.append('datasetId', input.datasetId);
  if (input.tags) body.append('tags', input.tags);
  if (input.remark) body.append('remark', input.remark);
  body.append('sourceFileName', file.name);
  body.append('graphEnabled', String(input.graphEnabled ?? false));
  return request<UploadDocumentResult>('/documents/upload', {
    method: 'POST',
    body,
    signal: options.signal,
    headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
  });
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
