import { ApiRequestError } from '../lib/errors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  request,
  setAccessTokenProvider,
  setAuthExpiredHandler,
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

  it('serializes plain request bodies as JSON but preserves FormData', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await request('/datasets', { method: 'POST', body: { name: 'Notes' } });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toBe('{"name":"Notes"}');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
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
});
