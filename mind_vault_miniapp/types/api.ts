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
  ingestionStatus?: DocumentProcessStatus | null;
  ingestionStage?: string | null;
  ingestionErrorMessage?: string | null;
  ingestionProgress?: DocumentProgress | null;
  graph?: GraphProgress | null;
}

export interface DocumentLocator {
  page?: number;
  slide?: number;
  sheet?: string;
  cellRange?: string;
  lineStart?: number;
  lineEnd?: number;
  jsonPath?: string;
}

export interface DocumentSection {
  sectionId: string;
  heading?: string;
  text: string;
  order: number;
  locator: DocumentLocator;
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
  | 'CANCELLED'
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
  stageProgress: DocumentProgress;
  graph?: GraphProgress | null;
}

export interface DocumentProgress {
  completed: number;
  total: number;
  percent: number;
  estimatedRemainingSeconds: number | null;
  stageStartedAt?: string | null;
}

export interface GraphProgress {
  status: 'NOT_STARTED' | 'PROCESSING' | 'READY' | 'FAILED';
  completed: number;
  total: number;
  failed: number;
  estimatedRemainingSeconds: number | null;
}

export interface DocumentProgressEvent {
  documentId: string;
  stage: string;
  status: DocumentProcessStatus;
  completed: number;
  total: number;
  percent: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  graph?: GraphProgress | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
