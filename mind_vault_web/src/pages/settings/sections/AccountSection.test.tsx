import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProfile, updateNickname, updateUsername } from '../../../api/profile';
import type { Profile } from '../../../api/profile';
import { ApiRequestError } from '../../../lib/errors';
import { AccountSection } from './AccountSection';

vi.mock('../../../api/profile', () => ({
  fetchAvatarBlob: vi.fn(),
  getProfile: vi.fn(),
  removeAvatar: vi.fn(),
  updateNickname: vi.fn(),
  updateUsername: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock('../../../features/settings/avatar-canvas', () => ({
  canvasToBlob: vi.fn(),
  decodeImage: vi.fn(),
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

function renderSection(profile: Profile = makeProfile()) {
  vi.mocked(getProfile).mockResolvedValue({ user: profile });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountSection />
    </QueryClientProvider>,
  );
}

async function openUsernameDialog() {
  fireEvent.click(await screen.findByRole('button', { name: '更改用户名' }));
}

describe('AccountSection', () => {
  beforeEach(() => {
    vi.mocked(getProfile).mockReset();
    vi.mocked(updateNickname).mockReset();
    vi.mocked(updateUsername).mockReset();
  });

  it('shows the read-only account fields', async () => {
    renderSection();

    expect(await screen.findByText('tester')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('普通账号')).toBeInTheDocument();
  });

  it('blocks a nickname longer than the 32 character limit', async () => {
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '修改' }));
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: 'a'.repeat(33) } });

    expect(screen.getByText('昵称最多 32 个字符')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(updateNickname).not.toHaveBeenCalled();
  });

  it('saves a valid nickname and reflects the new value', async () => {
    vi.mocked(updateNickname).mockResolvedValue({
      accessToken: 'new-token',
      user: makeProfile({ nickname: '新昵称' }),
    });
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: '修改' }));
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '新昵称' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(updateNickname).toHaveBeenCalledWith('新昵称'));
    expect(await screen.findByText('昵称已更新')).toBeInTheDocument();
    expect(screen.getByText('新昵称')).toBeInTheDocument();
  });

  it('validates the username pattern before hitting the server', async () => {
    renderSection();

    await openUsernameDialog();
    fireEvent.change(await screen.findByLabelText('新用户名'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('需为 3-64 位字母、数字、下划线或中划线');
    expect(updateUsername).not.toHaveBeenCalled();
  });

  it('maps a wrong current password to a readable message', async () => {
    vi.mocked(updateUsername).mockRejectedValue(
      new ApiRequestError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'invalid password' }),
    );
    renderSection();

    await openUsernameDialog();
    fireEvent.change(await screen.findByLabelText('新用户名'), { target: { value: 'new-name' } });
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(updateUsername).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('当前密码不正确');
  });

  it('updates the username and explains that the login name changed', async () => {
    vi.mocked(updateUsername).mockResolvedValue({
      accessToken: 'new-token',
      user: makeProfile({ username: 'new-name' }),
    });
    renderSection();

    await openUsernameDialog();
    fireEvent.change(await screen.findByLabelText('新用户名'), { target: { value: 'new-name' } });
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('status')).toHaveTextContent('用户名已更新，下次登录请使用新用户名');
    expect(screen.getByText('new-name')).toBeInTheDocument();
  });

  it('disables every editing entry for the development account', async () => {
    renderSection(makeProfile({ isDevAccount: true, createdAt: null }));

    expect(await screen.findByText('开发账号不支持修改资料')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '更改用户名' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '更换头像' })).toBeDisabled();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});