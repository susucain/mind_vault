export interface ApiError {
  statusCode: number;
  message: string;
  requestId?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  dependencies: Record<string, 'up' | 'down'>;
}
