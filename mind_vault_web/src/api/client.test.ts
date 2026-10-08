import { ApiRequestError } from '../lib/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  request,
  setAccessTokenProvider,
  setAuthExpiredHandler,
  xhrUpload,
} from './client';

describe('request', () => {
  afterEach(() => {
    setAccessTokenProvider(() => undefined);
    setAuthExpiredHandler(undefined);
    vi.restoreAllMocks();
  });

  it('adds a bearer token and request id to authenticated requests', async () => {
    setAccessTokenProvider(() => 'access-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'user-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await request<{ user: { id: string } }>('/me');

    expect(fetchMock).toHaveBeenCalledWith('/v1/me', expect.any(Object));
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('X-Request-ID')).toEqual(expect.any(String));
  });

  it('normalizes the Nest error payload and response request id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 422,
          message: ['datasetId must be a string'],
          error: 'Unprocessable Entity',
        }),
        {
          status: 422,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': 'req-422',
          },
        },
      ),
    );

    await expect(request('/documents/upload')).rejects.toMatchObject({
      status: 422,
      code: 'Unprocessable Entity',
      message: 'datasetId must be a string',
      requestId: 'req-422',
    } satisfies Partial<ApiRequestError>);
  });

  it('keeps the structured details returned for rejected duplicate uploads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 409,
          message: '该文件已存在：a.txt',
          error: 'DUPLICATE_DOCUMENT',
          details: { duplicateOf: { id: 'doc-9', name: 'a.txt' } },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(request('/documents/upload')).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_DOCUMENT',
      details: { duplicateOf: { id: 'doc-9', name: 'a.txt' } },
    } satisfies Partial<ApiRequestError>);
  });

  it('serializes plain request bodies as JSON but preserves FormData', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await request('/datasets', { method: 'POST', body: { name: 'Notes' } });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toBe('{"name":"Notes"}');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');

    const form = new FormData();
    form.append('file', new File(['content'], 'notes.txt'));
    await request('/documents/upload', { method: 'POST', body: form });

    const [, formInit] = fetchMock.mock.calls[1]!;
    expect(formInit?.body).toBe(form);
    expect(new Headers(formInit?.headers).has('Content-Type')).toBe(false);
  });

  it('notifies the registered handler for unauthorized responses', async () => {
    const onExpired = vi.fn();
    setAuthExpiredHandler(onExpired);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(request('/me')).rejects.toBeInstanceOf(ApiRequestError);

    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('keeps credential errors on anonymous endpoints out of the auth expiry handler', async () => {
    const onExpired = vi.fn();
    setAuthExpiredHandler(onExpired);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 401,
          message: '用户名或密码错误',
          error: 'Unauthorized',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      request('/auth/login', { method: 'POST', body: {}, skipAuthExpiry: true }),
    ).rejects.toThrow('用户名或密码错误');

    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('xhrUpload', () => {
  class FakeUpload {
    onprogress: ((event: ProgressEvent) => void) | null = null;
  }

  class FakeXhr {
    static instances: FakeXhr[] = [];
    method = '';
    url = '';
    headers: Record<string, string> = {};
    status = 0;
    statusText = '';
    responseText = '';
    upload = new FakeUpload();
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    aborted = false;
    sentBody: unknown;
    private responseHeaders: Record<string, string> = {};

    constructor() {
      FakeXhr.instances.push(this);
    }
    open(method: string, url: string): void {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(key: string, value: string): void {
      this.headers[key] = value;
    }
    setResponseHeaders(headers: Record<string, string>): void {
      this.responseHeaders = headers;
    }
    getResponseHeader(name: string): string | null {
      return this.responseHeaders[name] ?? null;
    }
    send(body: unknown): void {
      this.sentBody = body;
    }
    abort(): void {
      this.aborted = true;
      this.onabort?.();
    }
  }

  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  afterEach(() => {
    setAccessTokenProvider(() => undefined);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uploads a form with auth headers and reports byte progress', async () => {
    setAccessTokenProvider(() => 'access-token');
    const onProgress = vi.fn();
    const form = new FormData();
    form.append('file', new File(['content'], 'notes.txt'));

    const promise = xhrUpload<{ documentId: string }>('/documents/upload', form, {
      onProgress,
    });
    const xhr = FakeXhr.instances[0]!;

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/v1/documents/upload');
    // Headers.forEach 会把名称规范为小写；HTTP 头名本身大小写不敏感
    expect(xhr.headers.authorization).toBe('Bearer access-token');
    expect(xhr.headers['x-request-id']).toEqual(expect.any(String));
    expect(xhr.sentBody).toBe(form);

    xhr.upload.onprogress?.(
      new ProgressEvent('progress', { lengthComputable: true, loaded: 25, total: 100 }),
    );
    expect(onProgress).toHaveBeenCalledWith(25);
    // 总量未知时（lengthComputable=false）不触发，避免进度虚跳
    xhr.upload.onprogress?.(new ProgressEvent('progress', { lengthComputable: false }));
    expect(onProgress).toHaveBeenCalledTimes(1);

    xhr.status = 201;
    xhr.responseText = JSON.stringify({ documentId: 'doc-1' });
    xhr.onload?.();

    await expect(promise).resolves.toEqual({ documentId: 'doc-1' });
  });

  it('normalizes the Nest error payload for rejected uploads', async () => {
    const form = new FormData();
    const promise = xhrUpload('/documents/upload', form);
    const xhr = FakeXhr.instances[0]!;

    xhr.status = 422;
    xhr.statusText = 'Unprocessable Entity';
    xhr.responseText = JSON.stringify({
      statusCode: 422,
      message: ['datasetId must be a string'],
      error: 'Unprocessable Entity',
    });
    xhr.setResponseHeaders({
      'Content-Type': 'application/json',
      'X-Request-Id': 'req-422',
    });
    xhr.onload?.();

    await expect(promise).rejects.toMatchObject({
      status: 422,
      code: 'Unprocessable Entity',
      message: 'datasetId must be a string',
      requestId: 'req-422',
    } satisfies Partial<ApiRequestError>);
  });

  it('aborts the in-flight request when the caller aborts the signal', async () => {
    const controller = new AbortController();
    const form = new FormData();
    const promise = xhrUpload('/documents/upload', form, { signal: controller.signal });
    const xhr = FakeXhr.instances[0]!;

    controller.abort();

    expect(xhr.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
