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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
