import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from 'react-router-dom';
import { getProfile } from '../../api/profile';
import { router } from '../../app/router';
import { useAuthStore } from '../../stores/auth.store';

vi.mock('../../api/profile', () => ({
  fetchAvatarBlob: vi.fn(),
  getProfile: vi.fn(),
  removeAvatar: vi.fn(),
  updateNickname: vi.fn(),
  updateUsername: vi.fn(),
  uploadAvatar: vi.fn(),
}));

describe('SettingsPage', () => {
  function renderRouter() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  }

  beforeEach(() => {
    vi.mocked(getProfile).mockResolvedValue({
      user: {
        id: 'user-1',
        username: 'tester',
        nickname: '阿宝',
        avatarKey: null,
        createdAt: '2026-01-01T12:00:00Z',
        isDevAccount: false,
      },
    });
  });

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