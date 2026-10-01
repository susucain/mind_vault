import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { router } from './router';
import { useAuthStore } from '../stores/auth.store';

describe('App', () => {
  afterEach(async () => {
    useAuthStore.getState().clear();
    await act(async () => {
      await router.navigate('/login');
    });
  });

  it('renders the login route for an unauthenticated visitor', async () => {
    useAuthStore.getState().clear();
    await act(async () => {
      await router.navigate('/login');
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '登录 Mind Vault' })).toBeInTheDocument();
    });
  });
});
