import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_LOGIN_REDIRECT_KEY, useAuthStore } from '../stores/auth.store';
import { ProtectedLayout, LoginPage } from './layouts';

vi.mock('../api/auth', () => ({
  devLogin: vi.fn().mockResolvedValue({ token: 'test-token', user: { id: 'user-1' } }),
}));

describe('authentication routes', () => {
  beforeEach(() => {
    useAuthStore.setState({ hydrated: true, token: undefined, user: undefined });
  });

  afterEach(() => {
    useAuthStore.getState().clear();
    localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  });

  it('returns an unauthenticated deep link to its guarded path after login', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/login', element: <LoginPage /> },
        {
          path: '/app',
          element: <ProtectedLayout />,
          children: [{ path: 'chat/:conversationId', element: <h1>Conversation</h1> }],
        },
      ],
      { initialEntries: ['/app/chat/conversation-1?draft=1'] },
    );

    render(<RouterProvider router={router} />);

    await user.click(await screen.findByRole('button', { name: '进入工作台' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/chat/conversation-1');
    });
    expect(router.state.location.search).toBe('?draft=1');
  });

  it('uses the stored redirect when login has no guarded location state', async () => {
    const user = userEvent.setup();
    localStorage.setItem(POST_LOGIN_REDIRECT_KEY, JSON.stringify('/app/library'));
    const router = createMemoryRouter(
      [
        { path: '/login', element: <LoginPage /> },
        {
          path: '/app',
          element: <ProtectedLayout />,
          children: [{ path: 'library', element: <h1>Library</h1> }],
        },
      ],
      { initialEntries: ['/login'] },
    );

    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('button', { name: '进入工作台' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/library');
    });
  });
});
