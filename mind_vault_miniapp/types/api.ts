export interface ApiError {
  statusCode: number;
  message: string;
  requestId?: string;
}

export interface WechatLoginResponse {
  accessToken: string;
  user: {
    id: string;
    nickname?: string;
  };
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  dependencies: Record<string, 'up' | 'down'>;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  sourceFileName?: string | null;
  sourceFileExtension?: string | null;
  sourceFileSize?: string | null;
  tags?: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export type DocumentProcessStatus =
  | 'UPLOADED'
  | 'PARSING'
  | 'PARSED'
  | 'CHUNKING'
  | 'EMBEDDING'
  | 'INDEXING'
  | 'READY'
  | 'FAILED'
  | 'DELETING'
  | 'DELETED';

export interface UploadDocumentResponse {
  documentId: string;
  jobId: string;
  title: string;
  fileName: string;
  fileExtension: string;
  fileSize: number;
  fileKey?: string | null;
  status: DocumentProcessStatus;
}

export interface DocumentProcess {
  documentId: string;
  jobId: string;
  status: DocumentProcessStatus;
  currentStage?: string | null;
  retryCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
