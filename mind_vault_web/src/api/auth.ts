import { jsonRequest, request } from './client';
import { appConfig } from '../lib/config';

export interface AuthUser {
  id: string;
  nickname?: string;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

function mockSession(username: string): AuthSession {
  return {
    token: 'mock-development-token',
    user: { id: 'mock-user', nickname: username.trim() || '演示用户' },
  };
}

export async function login(input: AuthCredentials): Promise<AuthSession> {
  if (appConfig.enableMockApi) return mockSession(input.username);
  const response = await jsonRequest<AuthResponse>('/auth/login', 'POST', input, {
    skipAuthExpiry: true,
  });
  return { token: response.accessToken, user: response.user };
}

export async function register(input: AuthCredentials): Promise<AuthSession> {
  if (appConfig.enableMockApi) return mockSession(input.username);
  const response = await jsonRequest<AuthResponse>('/auth/register', 'POST', input, {
    skipAuthExpiry: true,
  });
  return { token: response.accessToken, user: response.user };
}

export const getCurrentUser = () => request<{ user: AuthUser }>('/me');