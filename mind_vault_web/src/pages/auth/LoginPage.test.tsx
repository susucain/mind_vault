import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login } from '../../api/auth';
import { useAuthStore } from '../../stores/auth.store';
import { LoginPage } from './LoginPage';

vi.mock('../../api/auth', () => ({ login: vi.fn() }));

type LoginEntry = string | { pathname: string; state?: unknown };

function renderLogin(entries: LoginEntry[]) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <h1>注册</h1> },
      { path: '/app/library', element: <h1>知识库</h1> },
    ],
    { initialEntries: entries },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
    useAuthStore.setState({ hydrated: true, token: undefined, user: undefined });
  });

  it('submits credentials and returns to the deep link', async () => {
    let resolveLogin!: (value: { token: string; user: { id: string; nickname: string } }) => void;
    const pending = new Promise<{ token: string; user: { id: string; nickname: string } }>((resolve) => {
      resolveLogin = resolve;
    });
    vi.mocked(login).mockReturnValue(pending);
    const router = renderLogin([{ pathname: '/login', state: { from: '/app/library?status=ready' } }]);

    await userEvent.type(screen.getByLabelText('用户名'), 'dev');
    await userEvent.type(screen.getByLabelText('密码'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect(login).toHaveBeenCalledWith({ username: 'dev', password: '123456' });
    expect(screen.getByRole('button', { name: '正在登录' })).toBeDisabled();

    resolveLogin({ token: 'token', user: { id: '10001', nickname: '开发用户' } });

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/library'));
    expect(router.state.location.search).toBe('?status=ready');
    expect(useAuthStore.getState()).toMatchObject({ token: 'token', user: { id: '10001' } });
  });

  it('toggles password visibility with an accessible control', async () => {
    renderLogin(['/login']);
    const password = screen.getByLabelText('密码');
    expect(password).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: '显示' }));
    expect(password).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: '隐藏' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('requires credentials before calling the API', async () => {
    renderLogin(['/login']);
    await userEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('请输入用户名和密码');
    expect(login).not.toHaveBeenCalled();
  });

  it('announces login errors and keeps the form usable', async () => {
    vi.mocked(login).mockRejectedValue(new Error('offline'));
    renderLogin(['/login']);

    await userEvent.type(screen.getByLabelText('用户名'), 'dev');
    await userEvent.type(screen.getByLabelText('密码'), '123456');
    await userEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败');
    expect(screen.getByRole('button', { name: '进入工作台' })).toBeEnabled();
  });

  it('surfaces the server message when credentials are rejected', async () => {
    vi.mocked(login).mockRejectedValue(
      Object.assign(new Error('用户名或密码错误'), { status: 401, code: 'Unauthorized' }),
    );
    renderLogin(['/login']);

    await userEvent.type(screen.getByLabelText('用户名'), 'dev');
    await userEvent.type(screen.getByLabelText('密码'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码错误');
  });

  it('links to the registration page', () => {
    renderLogin(['/login']);
    expect(screen.getByRole('link', { name: '创建知识空间' })).toHaveAttribute('href', '/register');
  });
});