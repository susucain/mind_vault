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
});
