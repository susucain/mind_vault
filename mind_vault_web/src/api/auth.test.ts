import { afterEach, describe, expect, it, vi } from 'vitest';
import { login, register } from './auth';

function respondWith(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('auth api', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adapts the backend accessToken field to the internal token field on login', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respondWith({
        accessToken: 'backend-token',
        user: { id: '10001', nickname: '开发用户' },
      }),
    );

    await expect(login({ username: 'dev', password: '123456' })).resolves.toEqual({
      token: 'backend-token',
      user: { id: '10001', nickname: '开发用户' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/auth/login');
    expect(init?.method).toBe('POST');
  });

  it('posts credentials to the register endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respondWith({
        accessToken: 'new-token',
        user: { id: '1790000000000001', nickname: 'tester' },
      }),
    );

    await expect(register({ username: 'tester', password: '12345678' })).resolves.toEqual({
      token: 'new-token',
      user: { id: '1790000000000001', nickname: 'tester' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/auth/register');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ username: 'tester', password: '12345678' }));
  });
});