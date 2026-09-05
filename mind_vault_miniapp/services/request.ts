import { environment } from '../config/env';
import { ApiError } from '../types/api';
import { loadSession } from '../utils/session';
import { handleUnauthorized } from '../utils/auth-guard';

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
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${environment.apiBaseUrl}${options.path}`,
      method: (options.method ??
        'GET') as WechatMiniprogram.RequestOption['method'],
      data: options.data as WechatMiniprogram.IAnyObject | undefined,
      header: {
        ...(options.skipAuth || !session
          ? {}
          : { Authorization: `Bearer ${session.accessToken}` }),
      },
      success(response) {
        const requestId = response.header['X-Request-Id'] as string | undefined;
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as TResponse);
          return;
        }
        if (response.statusCode === 401) {
          handleUnauthorized();
        }
        reject({
          statusCode: response.statusCode,
          message:
            (response.data as { message?: string })?.message ?? '请求失败',
          requestId,
        } satisfies ApiError);
      },
      fail(error) {
        reject({
          statusCode: 0,
          message: error.errMsg || '网络连接失败',
        } satisfies ApiError);
      },
    });
  });
}
