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

export const devLogin = (input: DevLoginInput = {}) =>
  jsonRequest<AuthSession>('/auth/dev-login', 'POST', input);

export const getCurrentUser = () => request<{ user: AuthUser }>('/me');
