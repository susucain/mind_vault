export interface ApiError {
  status: number;
  code: string;
  message: string;
  /** Normalized from the X-Request-Id response header. */
  requestId?: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
}

/** Nest sends the request id in this response header, not in the JSON payload. */
export interface ApiErrorHeaders {
  'X-Request-Id'?: string;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNext?: boolean;
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
