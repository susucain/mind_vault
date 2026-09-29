import { jsonRequest, request } from './client';

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
  const response = await jsonRequest<DevLoginResponse>('/auth/dev-login', 'POST', input);
  return { token: response.accessToken, user: response.user };
}

export const getCurrentUser = () => request<{ user: AuthUser }>('/me');
