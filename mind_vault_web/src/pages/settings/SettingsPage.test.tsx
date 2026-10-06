import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RouterProvider } from 'react-router-dom';
import { router } from '../../app/router';
import { useAuthStore } from '../../stores/auth.store';

describe('SettingsPage', () => {
  function renderRouter() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  }

  afterEach(async () => {
    useAuthStore.getState().clear();
    await router.navigate('/');
  });

  it('deep-links to a section and marks that section active', async () => {
    useAuthStore.getState().setSession({ token: 'test-token', user: { id: 'user-1' } });
    await router.navigate('/app/settings/memory');

    renderRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '长期记忆' })).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/app/settings/memory');
    expect(screen.getByRole('link', { name: '长期记忆' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '账户信息' })).not.toHaveAttribute('aria-current');
  });

  it('redirects the bare settings path to the account section', async () => {
    useAuthStore.getState().setSession({ token: 'test-token', user: { id: 'user-1' } });
    await router.navigate('/app/settings');

    renderRouter();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/settings/account');
    });
    expect(screen.getByRole('heading', { name: '账户信息' })).toBeInTheDocument();
  });

  it('redirects an unknown section to the account section', async () => {
    useAuthStore.getState().setSession({ token: 'test-token', user: { id: 'user-1' } });
    await router.navigate('/app/settings/unknown');

    renderRouter();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/settings/account');
    });
  });
});