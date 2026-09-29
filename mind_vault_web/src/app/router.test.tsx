import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useAuthStore } from '../stores/auth.store';

describe('router', () => {
  function renderRouter() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  }

  afterEach(async () => {
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
});
