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
  return new Promise<UploadDocumentResponse>((resolve, reject) => {
    const task = wx.uploadFile({
      url: `${environment.apiBaseUrl}/documents/upload`,
      filePath: file.path,
      name: 'file',
      formData: { datasetId },
      header: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const data = JSON.parse(response.data || '{}') as {
            message?: string;
          };
          reject(new Error(data.message ?? '文件上传失败'));
          return;
        }
        resolve(JSON.parse(response.data) as UploadDocumentResponse);
      },
      fail(error) {
        reject(new Error(error.errMsg || '文件上传失败'));
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
