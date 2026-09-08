import { environment } from '../config/env';
import { ApiError } from '../types/api';
import { loadSession } from '../utils/session';
import { handleUnauthorized } from '../utils/auth-guard';
import { recordRequestTrace } from '../utils/telemetry';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions<T> {
  path: string;
  method?: HttpMethod;
  data?: T;
  skipAuth?: boolean;
}

export function request<TResponse, TData = Record<string, unknown>>(
  options: RequestOptions<TData>
): Promise<TResponse> {
  const session = loadSession();
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${environment.apiBaseUrl}${options.path}`,
      timeout: environment.requestTimeout,
      method: (options.method ??
        'GET') as WechatMiniprogram.RequestOption['method'],
      data: options.data as WechatMiniprogram.IAnyObject | undefined,
      header: {
        ...(options.skipAuth || !session
          ? {}
          : { Authorization: `Bearer ${session.accessToken}` }),
      },
      success(response) {
        const requestId = (response.header['X-Request-Id'] ??
          response.header['x-request-id']) as string | undefined;
        const durationMs = Date.now() - startedAt;
        if (response.statusCode >= 200 && response.statusCode < 300) {
          recordRequestTrace({
            timestamp: Date.now(),
            method: options.method ?? 'GET',
            path: options.path,
            durationMs,
            statusCode: response.statusCode,
            requestId,
          });
          resolve(response.data as TResponse);
          return;
        }
        if (response.statusCode === 401) {
          handleUnauthorized();
        }
        const error = {
          statusCode: response.statusCode,
          message:
            (response.data as { message?: string })?.message ?? '请求失败',
          requestId,
        } satisfies ApiError;
        recordRequestTrace({
          timestamp: Date.now(),
          method: options.method ?? 'GET',
          path: options.path,
          durationMs,
          statusCode: response.statusCode,
          requestId,
          error: error.message,
        });
        reject(error);
      },
      fail(error) {
        const apiError = {
          statusCode: 0,
          message: error.errMsg || '网络连接失败',
        } satisfies ApiError;
        recordRequestTrace({
          timestamp: Date.now(),
          method: options.method ?? 'GET',
          path: options.path,
          durationMs: Date.now() - startedAt,
          error: apiError.message,
        });
        reject(apiError);
      },
    });
  });
}
