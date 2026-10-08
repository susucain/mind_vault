import { appConfig } from '../lib/config';
import { ApiRequestError } from '../lib/errors';
import type { ApiErrorPayload } from '../types/api';

type AccessTokenProvider = () => string | undefined;
type AuthExpiredHandler = () => void;
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  /** 登录 / 注册等匿名端点：401 表示凭据错误，不应触发全局「登录过期」跳转 */
  skipAuthExpiry?: boolean;
}

export interface BuiltRequest {
  url: string;
  init: RequestInit;
}

let accessTokenProvider: AccessTokenProvider = () => undefined;
let authExpiredHandler: AuthExpiredHandler | undefined;

export function setAccessTokenProvider(provider: AccessTokenProvider): void {
  accessTokenProvider = provider;
}

export function setAuthExpiredHandler(handler: AuthExpiredHandler | undefined): void {
  authExpiredHandler = handler;
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random()}`;
}

function apiUrl(path: string): string {
  return `${appConfig.apiBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function isJsonPayload(body: RequestOptions['body']): body is Record<string, unknown> | unknown[] {
  return (
    body !== null &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body) &&
    !('pipe' in body)
  );
}

export async function responseError(
  response: Response,
  notifyAuthExpiry = true,
): Promise<ApiRequestError> {
  let payload: Partial<ApiErrorPayload> | undefined;
  try {
    payload = (await response.json()) as Partial<ApiErrorPayload>;
  } catch {
    // Keep a meaningful fallback for non-JSON gateway errors.
  }
  const message = Array.isArray(payload?.message)
    ? payload.message.join(', ')
    : payload?.message || response.statusText || 'Request failed';

  const error = new ApiRequestError({
    status: payload?.statusCode ?? response.status,
    code: payload?.error || `HTTP_${response.status}`,
    message,
    requestId: response.headers.get('X-Request-Id') ?? undefined,
    // 透传 details，供上传队列识别 409 的 duplicateOf 并高亮既有文档
    details: payload?.details,
  });
  if (error.status === 401 && notifyAuthExpiry) authExpiredHandler?.();
  return error;
}

export function buildRequest(path: string, init: RequestOptions = {}): BuiltRequest {
  // skipAuthExpiry 由 request() 消费，不进入 fetch init。
  const { skipAuthExpiry, ...fetchInit } = init;
  void skipAuthExpiry;
  const headers = new Headers(fetchInit.headers);
  const token = accessTokenProvider();
  const body = isJsonPayload(fetchInit.body) ? JSON.stringify(fetchInit.body) : fetchInit.body;
  headers.set('X-Request-ID', requestId());
  if (token) headers.set('Authorization', `Bearer ${token}`);

  if (isJsonPayload(fetchInit.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return {
    url: apiUrl(path),
    init: { ...fetchInit, body, headers },
  };
}

export async function request<T>(
  path: string,
  init: RequestOptions = {},
): Promise<T> {
  const built = buildRequest(path, init);

  let response: Response;
  try {
    response = await fetch(built.url, built.init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiRequestError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network request failed',
    });
  }

  if (!response.ok) {
    throw await responseError(response, !init.skipAuthExpiry);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function jsonRequest<T>(
  path: string,
  method: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  return request<T>(path, {
    ...options,
    method,
    body: body as RequestOptions['body'],
  });
}
