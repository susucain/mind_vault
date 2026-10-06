import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useAuthStore } from '../stores/auth.store';
import { clearPendingLogoutNotice, hasPendingLogoutNotice } from '../features/settings/logout';

describe('router', () => {
  function renderRouter() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  }

  afterEach(async () => {
    clearPendingLogoutNotice();
    useAuthStore.getState().clear();
    await router.navigate('/');
  });

  it('redirects an unauthenticated protected route to login', async () => {
    useAuthStore.getState().clear();
    await router.navigate('/app/library');

    renderRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '登录 Mind Vault' })).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/login');
  });

  it('redirects the root path to the protected overview route', async () => {
    useAuthStore.getState().setSession({ token: 'test-token', user: { id: 'user-1' } });
    await router.navigate('/');

    renderRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /今天想整理什么/ })).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/app/overview');
  });

  it('redirects the authenticated app root to overview', async () => {
    useAuthStore.getState().setSession({ token: 'test-token', user: { id: 'user-1' } });
    await router.navigate('/app');

    renderRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /今天想整理什么/ })).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/app/overview');
  });

  it.each([
    '/app/library/documents',
    '/app/library/datasets/dataset-1',
    '/app/library/folders',
    '/app/library/tags',
    '/app/library/archive',
    '/app/retrieval',
    '/app/chat',
    '/app/interview/sessions',
  ])('protects the registered placeholder route %s', async (path) => {
    useAuthStore.getState().clear();
    await router.navigate(path);

    renderRouter();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  it('shows the one-shot logout notice instead of losing it to the auth guard redirect', async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({ token: 'test-token', user: { id: 'user-1', nickname: '阿宝' } });
    await router.navigate('/app/settings/security');

    renderRouter();

    await user.click(await screen.findByRole('button', { name: '退出登录' }));
    await user.click(await screen.findByRole('button', { name: '确认退出' }));

    expect(await screen.findByRole('status')).toHaveTextContent('已退出登录');
    expect(router.state.location.pathname).toBe('/login');
    // 提示只读一次：登录页挂载后标记即被消费，再回登录页不会再弹
    await waitFor(() => expect(hasPendingLogoutNotice()).toBe(false));
  });
});
