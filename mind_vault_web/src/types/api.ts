export interface ApiError {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

export type UploadStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadItem {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  status: UploadStatus;
  progress: UploadProgress;
  documentId?: string;
  error?: ApiError;
}

export type Upload = UploadItem;
