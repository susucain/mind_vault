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

export function uploadDocument(
  file: SelectedFile,
  datasetId: string,
  onProgress: (progress: number) => void
) {
  const session = loadSession();
  if (!session) return Promise.reject(new Error('登录已失效'));
  const startedAt = Date.now();
  return new Promise<UploadDocumentResponse>((resolve, reject) => {
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
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const data = JSON.parse(response.data || '{}') as {
            message?: string;
          };
          const error = new Error(data.message ?? '文件上传失败');
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
        const uploadError = new Error(error.errMsg || '文件上传失败');
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
