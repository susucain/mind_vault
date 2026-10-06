import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAvatarBlob, removeAvatar, uploadAvatar } from '../../../api/profile';
import type { Profile } from '../../../api/profile';
import { ApiRequestError } from '../../../lib/errors';
import { AvatarUploader } from './AvatarUploader';

vi.mock('../../../api/profile', () => ({
  fetchAvatarBlob: vi.fn(),
  getProfile: vi.fn(),
  removeAvatar: vi.fn(),
  updateNickname: vi.fn(),
  updateUsername: vi.fn(),
  uploadAvatar: vi.fn(),
}));

// 裁剪与编码属浏览器能力，这里只验证上传器的状态流转
vi.mock('../../../features/settings/avatar-canvas', () => ({
  canvasToBlob: vi.fn(async () => new Blob(['webp'], { type: 'image/webp' })),
  decodeImage: vi.fn(async () => ({ source: {}, size: { width: 200, height: 200 } })),
  drawCrop: vi.fn(),
}));

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    username: 'tester',
    nickname: '阿宝',
    avatarKey: null,
    createdAt: '2026-01-01T12:00:00Z',
    isDevAccount: false,
    ...overrides,
  };
}

function renderUploader(profile: Profile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AvatarUploader profile={profile} />
    </QueryClientProvider>,
  );
}

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText('选择头像文件'), { target: { files: [file] } });
}

describe('AvatarUploader', () => {
  beforeEach(() => {
    vi.mocked(uploadAvatar).mockReset();
    vi.mocked(removeAvatar).mockReset();
    vi.mocked(fetchAvatarBlob).mockReset();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('falls back to the nickname initial when there is no avatar', () => {
    renderUploader(makeProfile());

    expect(screen.getByText('阿')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '移除' })).not.toBeInTheDocument();
  });

  it('loads the stored avatar through the authenticated endpoint', async () => {
    vi.mocked(fetchAvatarBlob).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

    renderUploader(makeProfile({ avatarKey: 'avatars/1.png' }));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: '阿宝 的头像' })).toHaveAttribute('src', 'blob:preview');
    });
  });

  it('rejects an unsupported file before opening the cropper', async () => {
    renderUploader(makeProfile());

    selectFile(new File(['x'], 'avatar.gif', { type: 'image/gif' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('仅支持 PNG / JPEG / WebP 图片');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uploads the cropped blob and reports success', async () => {
    vi.mocked(uploadAvatar).mockResolvedValue({ user: makeProfile({ avatarKey: 'avatars/2.webp' }) });

    renderUploader(makeProfile());
    selectFile(new File(['x'], 'avatar.png', { type: 'image/png' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledTimes(1));
    expect(vi.mocked(uploadAvatar).mock.calls[0][0].type).toBe('image/webp');
    expect(await screen.findByRole('status')).toHaveTextContent('头像已更新');
  });

  it('rolls back to the previous avatar and shows the server message on failure', async () => {
    vi.mocked(uploadAvatar).mockRejectedValue(
      new ApiRequestError({ status: 503, code: 'STORAGE_DISABLED', message: 'storage disabled' }),
    );

    renderUploader(makeProfile());
    selectFile(new File(['x'], 'avatar.png', { type: 'image/png' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('头像存储未启用');
    // 乐观预览已撤回，回到默认头像
    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
  });

  it('removes the avatar only after the confirmation', async () => {
    vi.mocked(fetchAvatarBlob).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    vi.mocked(removeAvatar).mockResolvedValue({ user: makeProfile() });

    renderUploader(makeProfile({ avatarKey: 'avatars/1.png' }));
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '移除' }));
    expect(removeAvatar).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: '确认移除' }));

    await waitFor(() => expect(removeAvatar).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('头像已移除');
  });

  it('disables avatar editing for the development account', () => {
    renderUploader(makeProfile({ isDevAccount: true }));

    expect(screen.getByRole('button', { name: '更换头像' })).toBeDisabled();
    expect(screen.getByText('开发账号不支持修改头像。')).toBeInTheDocument();
  });
});