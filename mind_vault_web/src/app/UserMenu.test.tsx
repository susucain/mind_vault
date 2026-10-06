import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth.store';
import { UserMenu } from './UserMenu';

vi.mock('../features/settings/queries', () => ({
  revokeAllAvatarUrls: vi.fn(),
  useAvatarUrl: vi.fn(() => undefined),
}));

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/overview']}>
        <Routes>
          <Route element={<UserMenu />} path="/app/overview" />
          <Route element={<h1>个人设置页</h1>} path="/app/settings/account" />
          <Route element={<h1>登录页</h1>} path="/login" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '账户菜单' }));
  return user;
}

describe('UserMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().setSession({
      token: 'token-1',
      user: { id: 'user-1', nickname: '阿宝', username: 'tester' },
    });
  });

  afterEach(() => {
    useAuthStore.getState().clear();
  });

  it('shows the identity and links to the settings page', async () => {
    renderMenu();
    const user = await openMenu();

    expect(await screen.findByText('阿宝')).toBeInTheDocument();
    expect(screen.getByText('@tester')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: '个人设置' }));

    expect(await screen.findByRole('heading', { name: '个人设置页' })).toBeInTheDocument();
  });

  it('confirms before logging out and keeps the session when cancelled', async () => {
    renderMenu();
    const user = await openMenu();

    await user.click(await screen.findByRole('menuitem', { name: '退出登录' }));
    await user.click(await screen.findByRole('button', { name: '取消' }));

    // 等 Radix 菜单/弹窗的关闭状态落定，避免游离的 act 警告
    await waitFor(() => expect(screen.queryByRole('button', { name: '确认退出' })).not.toBeInTheDocument());
    expect(useAuthStore.getState().token).toBe('token-1');
  });

  it('clears local state and returns to the login page after confirming', async () => {
    renderMenu();
    const user = await openMenu();

    await user.click(await screen.findByRole('menuitem', { name: '退出登录' }));
    await user.click(await screen.findByRole('button', { name: '确认退出' }));

    expect(await screen.findByRole('heading', { name: '登录页' })).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBeUndefined();
    expect(localStorage.getItem('mind-vault.auth')).toBeNull();
  });
});