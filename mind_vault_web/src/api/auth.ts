import { jsonRequest, request } from './client';
import { appConfig } from '../lib/config';

export interface AuthUser {
  id: string;
  nickname?: string;
}

export interface DevLoginInput {
  userId?: string;
  nickname?: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

interface DevLoginResponse {
  accessToken: string;
  user: AuthUser;
}

export async function devLogin(input: DevLoginInput = {}): Promise<AuthSession> {
  if (appConfig.enableMockApi) {
    return {
      token: 'mock-development-token',
      user: { id: 'mock-user', nickname: input.nickname?.trim() || '演示用户' },
    };
  }
  const response = await jsonRequest<DevLoginResponse>('/auth/dev-login', 'POST', input);
  return { token: response.accessToken, user: response.user };
}

export const getCurrentUser = () => request<{ user: AuthUser }>('/me');
