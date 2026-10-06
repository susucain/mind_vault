import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../lib/query-client';
import { useAppStore } from '../../stores/app.store';
import { POST_LOGIN_REDIRECT_KEY, useAuthStore } from '../../stores/auth.store';
import { READING_PREFERENCES_KEY } from '../documents/reading-preferences';
import { performLogout } from './logout';
import { revokeAllAvatarUrls } from './queries';

vi.mock('./queries', () => ({ revokeAllAvatarUrls: vi.fn() }));

describe('performLogout', () => {
  let clearSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(revokeAllAvatarUrls).mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    useAuthStore.getState().setSession({ token: 'token-1', user: { id: 'user-1', nickname: '阿宝' } });
    useAppStore.getState().setDatasetIds(['dataset-1']);
    useAppStore.getState().setTheme('dark');
    localStorage.setItem(POST_LOGIN_REDIRECT_KEY, JSON.stringify('/app/library'));
    localStorage.setItem(READING_PREFERENCES_KEY, JSON.stringify({ fontSize: 'large', lineHeight: 'loose' }));
    queryClient.setQueryData(['settings', 'profile'], { user: { id: 'user-1' } });

    clearSpy = vi.spyOn(queryClient, 'clear');
  });

  afterEach(() => {
    clearSpy.mockRestore();
    vi.unstubAllGlobals();
    useAuthStore.getState().clear();
  });

  it('clears every piece of local state in one pass', () => {
    performLogout();

    expect(useAuthStore.getState().token).toBeUndefined();
    expect(useAuthStore.getState().user).toBeUndefined();
    expect(localStorage.getItem('mind-vault.auth')).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['settings', 'profile'])).toBeUndefined();
    expect(localStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull();
    expect(localStorage.getItem(READING_PREFERENCES_KEY)).toBeNull();
    expect(revokeAllAvatarUrls).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().datasetIds).toEqual([]);
  });

  it('keeps device-level preferences such as the theme', () => {
    performLogout();

    expect(useAppStore.getState().theme).toBe('dark');
  });

  /** 退出是纯前端清理：任何网络请求都意味着与后端耦合了，这是本机制的硬性质 */
  it('does not call the network', () => {
    performLogout();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});