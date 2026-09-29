import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useAuthStore } from '../stores/auth.store';

describe('router', () => {
  afterEach(async () => {
    useAuthStore.getState().clear();
    await router.navigate('/');
  });

  it('redirects an unauthenticated protected route to login', async () => {
    useAuthStore.getState().clear();
    await router.navigate('/app/library');

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in to Mind Vault' })).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/login');
  });

  it('redirects the root path to the protected overview route', async () => {
    useAuthStore.getState().setSession({ token: 'test-token', user: { id: 'user-1' } });
    await router.navigate('/');

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/app/overview');
  });

  it('redirects the authenticated app root to overview', async () => {
    useAuthStore.getState().setSession({ token: 'test-token', user: { id: 'user-1' } });
    await router.navigate('/app');

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
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

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });
});
