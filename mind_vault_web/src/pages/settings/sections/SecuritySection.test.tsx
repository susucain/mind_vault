import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../../stores/auth.store';
import { SecuritySection } from './SecuritySection';

vi.mock('../../../features/settings/queries', () => ({ revokeAllAvatarUrls: vi.fn() }));

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/settings/security']}>
        <Routes>
          <Route element={<SecuritySection />} path="/app/settings/security" />
          <Route element={<h1>登录 Mind Vault</h1>} path="/login" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const CONFIRM_COPY = '将清除本机登录状态与缓存数据；已上传的知识库内容不受影响。';

describe('SecuritySection', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().setSession({ token: 'token-1', user: { id: 'user-1', nickname: '阿宝' } });
  });

  afterEach(() => {
    useAuthStore.getState().clear();
  });

  it('explains how the session is kept on this device', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: '安全' })).toBeInTheDocument();
    expect(screen.getByText('令牌存放')).toBeInTheDocument();
    expect(screen.getByText('退出影响')).toBeInTheDocument();
  });

  it('asks for confirmation and keeps the session when cancelled', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: '退出登录' }));
    // 危险区与确认弹窗使用同一份文案，因此断言限定在弹窗内
    expect(await screen.findByRole('dialog')).toHaveTextContent(CONFIRM_COPY);

    await user.click(screen.getByRole('button', { name: '取消' }));

    // 等弹窗的关闭状态落定，避免游离的 act 警告
    await waitFor(() => expect(screen.queryByRole('button', { name: '确认退出' })).not.toBeInTheDocument());
    expect(useAuthStore.getState().token).toBe('token-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears local state and returns to the login page after confirming', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: '退出登录' }));
    await user.click(await screen.findByRole('button', { name: '确认退出' }));

    expect(await screen.findByRole('heading', { name: '登录 Mind Vault' })).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBeUndefined();
    expect(localStorage.getItem('mind-vault.auth')).toBeNull();
  });
});