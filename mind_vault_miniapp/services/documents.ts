import {
  DocumentItem,
  DocumentSection,
  DocumentProcess,
  PaginatedResponse,
  UploadDocumentResponse,
} from '../types/api';
import { environment } from '../config/env';
import { request } from './request';
import { loadSession } from '../utils/session';
import { SelectedFile } from '../utils/file-picker';
import { recordRequestTrace } from '../utils/telemetry';
import { SseEvent, SseParser } from '../utils/sse';

export interface DocumentDetail extends DocumentItem {
  content: string;
  sections: DocumentSection[];
  pageCount: number;
}

export function listDocuments(datasetId?: string, page = 1, pageSize = 10) {
  const query = datasetId
    ? `?datasetId=${encodeURIComponent(datasetId)}&page=${page}&pageSize=${pageSize}`
    : `?page=${page}&pageSize=${pageSize}`;
  return request<PaginatedResponse<DocumentItem>>({
    path: `/documents${query}`,
  });
}

export function getDocument(id: string) {
  return request<DocumentDetail>({
    path: `/documents/${id}`,
  });
}

export function getDatasetDocumentStats(datasetId: string) {
  return request<{ total: number; available: number; processing: number }>({
    path: `/documents/datasets/${datasetId}/stats`,
  });
}

export interface SupportedFormats {
  extensions: string[];
}

let supportedFormatsCache: string[] | null = null;

/** 可上传格式清单：小程序不再硬编码白名单，统一由服务端下发（老格式取决于 soffice） */
export async function getSupportedFormats(): Promise<SupportedFormats> {
  if (supportedFormatsCache) return { extensions: supportedFormatsCache };
  const result = await request<SupportedFormats>({
    path: '/documents/supported-formats',
  });
  supportedFormatsCache = result.extensions;
  return result;
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

export interface UploadTaskHandle {
  abort: () => void;
}

export function uploadDocument(
  file: SelectedFile,
  datasetId: string,
  onProgress: (progress: number) => void,
  idempotencyKey?: string,
  onTaskReady?: (task: UploadTaskHandle) => void
) {
  const session = loadSession();
  if (!session) return Promise.reject(new Error('登录已失效'));
  const startedAt = Date.now();
  return new Promise<UploadDocumentResponse>((resolve, reject) => {
    let aborted = false;
    const task = wx.uploadFile({
      url: `${environment.apiBaseUrl}/documents/upload`,
      timeout: 60_000,
      filePath: file.path,
      name: 'file',
      formData: {
        datasetId,
        sourceFileName: file.name,
      },
      header: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const data = JSON.parse(response.data || '{}') as {
            message?: string;
            details?: { duplicateOf?: { name?: string } };
          };
          // 内容指纹命中同资料集既有文档（U3）：后端 409 返回 duplicateOf，明确提示而不是只透传枚举文案
          const duplicateName = data.details?.duplicateOf?.name;
          const error = new Error(
            duplicateName
              ? `该文件已存在：${duplicateName}`
              : data.message ?? '文件上传失败'
          );
          recordRequestTrace({
            timestamp: Date.now(),
            method: 'POST',
            path: '/documents/upload',
            durationMs: Date.now() - startedAt,
            statusCode: response.statusCode,
            error: error.message,
          });
          reject(error);
          return;
        }
        recordRequestTrace({
          timestamp: Date.now(),
          method: 'POST',
          path: '/documents/upload',
          durationMs: Date.now() - startedAt,
          statusCode: response.statusCode,
        });
        resolve(JSON.parse(response.data) as UploadDocumentResponse);
      },
      fail(error) {
        // 用户主动取消（U8 档 1）：wx.uploadFile 的 abort 会走 fail，这里给出明确文案而不是通用失败
        const uploadError = new Error(
          aborted ? '已取消上传' : error.errMsg || '文件上传失败'
        );
        recordRequestTrace({
          timestamp: Date.now(),
          method: 'POST',
          path: '/documents/upload',
          durationMs: Date.now() - startedAt,
          error: uploadError.message,
        });
        reject(uploadError);
      },
    });
    task.onProgressUpdate((progress) => onProgress(progress.progress));
    onTaskReady?.({
      abort: () => {
        aborted = true;
        task.abort();
      },
    });
  });
}

export function getDocumentProcess(id: string) {
  return request<DocumentProcess>({
    path: `/documents/${id}/status`,
  });
}

export function retryDocumentProcess(id: string) {
  return request<Pick<DocumentProcess, 'documentId' | 'jobId' | 'status'>>({
    path: `/documents/${id}/retry`,
    method: 'POST',
  });
}

/**
 * 取消上传（U8 档 1）：仅对尚未被 worker 接手的任务生效。
 * 已进入解析及之后阶段后端会返回 400，前端据此提示「已进入处理，无法取消」。
 */
export function cancelDocumentProcess(id: string) {
  return request<Pick<DocumentProcess, 'documentId' | 'jobId' | 'status'>>({
    path: `/documents/${id}/cancel`,
    method: 'POST',
  });
}

export function streamDocumentProgress(
  id: string,
  onEvent: (event: SseEvent) => void,
  onClosed: () => void,
) {
  const session = loadSession();
  if (!session) return { abort: () => undefined };
  const parser = new SseParser();
  let aborted = false;
  const task = wx.request({
    url: `${environment.apiBaseUrl}/documents/${id}/events`,
    method: 'GET',
    enableChunked: true,
    dataType: 'other',
    timeout: environment.streamTimeout,
    header: { Authorization: `Bearer ${session.accessToken}` },
    success: () => {
      if (!aborted) onClosed();
    },
    fail: () => {
      if (!aborted) onClosed();
    },
  });
  task.onChunkReceived((chunk) => {
    for (const event of parser.push(chunk.data)) onEvent(event);
  });
  return {
    abort: () => {
      aborted = true;
      task.abort();
    },
  };
}

export function streamLibraryDocumentProgress(
  onEvent: (event: SseEvent) => void,
  onClosed: () => void,
) {
  const session = loadSession();
  if (!session) return { abort: () => undefined };
  const parser = new SseParser();
  let aborted = false;
  const task = wx.request({
    url: `${environment.apiBaseUrl}/documents/events`,
    method: 'GET',
    enableChunked: true,
    dataType: 'other',
    timeout: environment.streamTimeout,
    header: { Authorization: `Bearer ${session.accessToken}` },
    success: () => {
      if (!aborted) onClosed();
    },
    fail: () => {
      if (!aborted) onClosed();
    },
  });
  task.onChunkReceived((chunk) => {
    for (const event of parser.push(chunk.data)) onEvent(event);
  });
  return {
    abort: () => {
      aborted = true;
      task.abort();
    },
  };
}
