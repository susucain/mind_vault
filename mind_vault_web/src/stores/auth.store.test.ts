import { afterEach, describe, expect, it, vi } from 'vitest';
import { request, setAuthExpiredHandler } from '../api/client';
import { useAuthStore } from './auth.store';

describe('auth store', () => {
  afterEach(() => {
    useAuthStore.getState().clear();
    vi.restoreAllMocks();
  });

  it('clears the persisted session when the client receives a 401', async () => {
    useAuthStore.getState().setSession({
      token: 'access-token',
      user: { id: 'user-1' },
    });
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

    await expect(request('/me')).rejects.toThrow('Unauthorized');

    expect(useAuthStore.getState()).toMatchObject({ token: undefined, user: undefined });
    setAuthExpiredHandler(undefined);
  });
});
