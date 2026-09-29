import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { devLogin } from '../../api/auth';
import { useAuthStore } from '../../stores/auth.store';
import { LoginPage } from './LoginPage';

vi.mock('../../api/auth', () => ({ devLogin: vi.fn() }));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(devLogin).mockReset();
    useAuthStore.setState({ hydrated: true, token: undefined, user: undefined });
  });

  it('submits an accessible development login and returns to the deep link', async () => {
    let resolveLogin!: (value: { token: string; user: { id: string; nickname: string } }) => void;
    const pending = new Promise<{ token: string; user: { id: string; nickname: string } }>((resolve) => {
      resolveLogin = resolve;
    });
    vi.mocked(devLogin).mockReturnValue(pending);
    const router = createMemoryRouter(
      [
        { path: '/login', element: <LoginPage /> },
        { path: '/app/library', element: <h1>知识库</h1> },
      ],
      { initialEntries: [{ pathname: '/login', state: { from: '/app/library?status=ready' } }] },
    );

    render(<RouterProvider router={router} />);
    await userEvent.type(screen.getByLabelText('显示名称'), '小明');
    await userEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect(screen.getByRole('button', { name: '正在登录' })).toBeDisabled();
    resolveLogin({ token: 'token', user: { id: 'u1', nickname: '小明' } });
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/library'));
    expect(router.state.location.search).toBe('?status=ready');
    expect(useAuthStore.getState()).toMatchObject({ token: 'token', user: { id: 'u1' } });
  });

  it('announces login errors and keeps the form usable', async () => {
    vi.mocked(devLogin).mockRejectedValue(new Error('offline'));
    render(
      <RouterProvider
        router={createMemoryRouter([{ path: '/login', element: <LoginPage /> }], {
          initialEntries: ['/login'],
        })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败');
    expect(screen.getByRole('button', { name: '进入工作台' })).toBeEnabled();
  });
});
