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
