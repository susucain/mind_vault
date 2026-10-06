import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../../api/auth';
import { ApiRequestError } from '../../lib/errors';
import { useAuthStore } from '../../stores/auth.store';
import { RegisterPage } from './RegisterPage';

vi.mock('../../api/auth', () => ({ register: vi.fn() }));

function renderRegister() {
  const router = createMemoryRouter(
    [
      { path: '/register', element: <RegisterPage /> },
      { path: '/app/overview', element: <h1>概览</h1> },
    ],
    { initialEntries: ['/register'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function fillForm(username: string, password: string, confirmPassword: string) {
  await userEvent.type(screen.getByLabelText('用户名'), username);
  await userEvent.type(screen.getByLabelText('密码'), password);
  await userEvent.type(screen.getByLabelText('确认密码'), confirmPassword);
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.mocked(register).mockReset();
    useAuthStore.setState({ hydrated: true, token: undefined, user: undefined });
  });

  it('creates the account and enters the workspace', async () => {
    vi.mocked(register).mockResolvedValue({
      token: 'token',
      user: { id: '1790000000000001', nickname: 'tester' },
    });
    const router = renderRegister();

    await fillForm('tester', '12345678', '12345678');
    await userEvent.click(screen.getByRole('button', { name: '创建知识空间' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/overview'));
    expect(register).toHaveBeenCalledWith({ username: 'tester', password: '12345678' });
    expect(useAuthStore.getState()).toMatchObject({ token: 'token' });
  });

  it('blocks mismatched passwords before calling the API', async () => {
    renderRegister();

    await fillForm('tester', '12345678', '87654321');
    await userEvent.click(screen.getByRole('button', { name: '创建知识空间' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('两次密码需要保持一致');
    expect(register).not.toHaveBeenCalled();
  });

  it('blocks short passwords before calling the API', async () => {
    renderRegister();

    await fillForm('tester', '1234567', '1234567');
    await userEvent.click(screen.getByRole('button', { name: '创建知识空间' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('密码至少 8 位');
    expect(register).not.toHaveBeenCalled();
  });

  it('blocks invalid usernames before calling the API', async () => {
    renderRegister();

    await fillForm('ab', '12345678', '12345678');
    await userEvent.click(screen.getByRole('button', { name: '创建知识空间' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('用户名需为 3-64 位');
    expect(register).not.toHaveBeenCalled();
  });

  it('shows the server message when the username is taken', async () => {
    vi.mocked(register).mockRejectedValue(
      new ApiRequestError({ status: 409, code: 'Conflict', message: '用户名已被注册' }),
    );
    renderRegister();

    await fillForm('tester', '12345678', '12345678');
    await userEvent.click(screen.getByRole('button', { name: '创建知识空间' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('用户名已被注册');
    expect(screen.getByRole('button', { name: '创建知识空间' })).toBeEnabled();
  });

  it('links back to the login page', () => {
    renderRegister();
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/login');
  });
});