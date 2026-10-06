import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuthExpiredHandler } from './client';
import {
  fetchAvatarBlob,
  getProfile,
  removeAvatar,
  updateNickname,
  updateUsername,
  uploadAvatar,
} from './profile';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const profile = {
  id: '10001',
  username: 'dev',
  nickname: '开发用户',
  avatarKey: null,
  createdAt: null,
  isDevAccount: true,
};

describe('profile api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setAuthExpiredHandler(undefined);
  });

  it('reads the real profile from /me', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: profile }));

    await expect(getProfile()).resolves.toEqual({ user: profile });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/me');
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it('patches the nickname and passes the re-issued token through', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ user: profile, accessToken: 'renewed' }));

    await expect(updateNickname('新昵称')).resolves.toEqual({
      user: profile,
      accessToken: 'renewed',
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ nickname: '新昵称' }));
  });

  it('sends the current password when renaming the login name', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ user: profile, accessToken: 'renewed' }));

    await updateUsername({ username: 'newname', currentPassword: 'secret' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/me/username');
    expect(init?.body).toBe(JSON.stringify({ username: 'newname', currentPassword: 'secret' }));
  });

  it('keeps a wrong-password 401 away from the global session-expiry handler', async () => {
    const expired = vi.fn();
    setAuthExpiredHandler(expired);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 401, message: '当前密码不正确', error: 'Unauthorized' }, 401),
    );

    await expect(
      updateUsername({ username: 'newname', currentPassword: 'wrong' }),
    ).rejects.toThrow('当前密码不正确');

    // 否则一次输错密码就会被清空会话并跳回登录页
    expect(expired).not.toHaveBeenCalled();
  });

  it('uploads the avatar as multipart form data, without forcing a JSON content type', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: profile }));

    await expect(uploadAvatar(new File(['x'], 'a.png', { type: 'image/png' }))).resolves.toEqual({
      user: profile,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/me/avatar');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect(new Headers(init?.headers).get('Content-Type')).toBeNull();
  });

  it('removes the avatar with DELETE and returns the updated profile', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ user: profile }));

    await expect(removeAvatar()).resolves.toEqual({ user: profile });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/me/avatar');
    expect(init?.method).toBe('DELETE');
  });

  it('returns avatar bytes from the authenticated endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['binary']), { status: 200 }),
    );

    await expect(fetchAvatarBlob()).resolves.toBeInstanceOf(Blob);
  });

  it('surfaces avatar download failures as ApiRequestError instead of an opaque blob', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 404, message: '尚未设置头像', error: 'NotFound' }, 404),
    );

    await expect(fetchAvatarBlob()).rejects.toMatchObject({ status: 404, message: '尚未设置头像' });
  });
});