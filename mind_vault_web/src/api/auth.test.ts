import { afterEach, describe, expect, it, vi } from 'vitest';
import { devLogin } from './auth';

describe('devLogin', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adapts the backend accessToken field to the internal token field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'backend-token',
          user: { id: 'user-1', nickname: 'Developer' },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(devLogin()).resolves.toEqual({
      token: 'backend-token',
      user: { id: 'user-1', nickname: 'Developer' },
    });
  });
});
