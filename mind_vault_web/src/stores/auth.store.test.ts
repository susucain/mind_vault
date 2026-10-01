import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../api/client';
import {
  POST_LOGIN_REDIRECT_KEY,
  setAuthExpiredRedirectHandler,
  useAuthStore,
} from './auth.store';
import { readStoredValue } from '../lib/storage';

describe('auth store', () => {
  beforeEach(() => {
    setAuthExpiredRedirectHandler(vi.fn());
  });

  afterEach(() => {
    useAuthStore.getState().clear();
    setAuthExpiredRedirectHandler(undefined);
    window.history.pushState({}, '', '/');
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
  });

  it('stores the current URL and delegates the login redirect through an injected handler', async () => {
    window.history.pushState({}, '', '/app/chat/conversation-1?draft=1');
    const redirect = vi.fn();
    setAuthExpiredRedirectHandler(redirect);
    useAuthStore.getState().setSession({
      token: 'access-token',
      user: { id: 'user-1' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(request('/me')).rejects.toThrow('Unauthorized');

    expect(readStoredValue<string>(POST_LOGIN_REDIRECT_KEY)).toBe('/app/chat/conversation-1?draft=1');
    expect(redirect).toHaveBeenCalledWith('/app/chat/conversation-1?draft=1');
  });
});
