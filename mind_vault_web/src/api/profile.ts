import { buildRequest, jsonRequest, request, responseError } from './client';
import { ApiRequestError } from '../lib/errors';

/** 与后端 ProfileView 一一对应：JWT 载荷里没有的信息一律以本接口为准 */
export interface Profile {
  id: string;
  username: string;
  nickname: string;
  avatarKey: string | null;
  /** 开发账号不落库，没有注册时间 */
  createdAt: string | null;
  /** 开发账号来自环境变量，后端对它的写操作一律 403 */
  isDevAccount: boolean;
}

/** 昵称 / 用户名在 JWT 载荷内，改完必须换新令牌，否则顶栏会停留在旧值 */
export interface ProfileSession {
  user: Profile;
  accessToken: string;
}

export const getProfile = () => request<{ user: Profile }>('/me');

export const updateNickname = (nickname: string) =>
  jsonRequest<ProfileSession>('/me', 'PATCH', { nickname });

/**
 * 改登录名需要当前密码确认。密码错误的 401 与「登录过期」的 401 同码，
 * 这里跳过全局过期处理，否则一次输错密码就会被清空会话并跳登录页。
 */
export const updateUsername = (input: { username: string; currentPassword: string }) =>
  jsonRequest<ProfileSession>('/me/username', 'PATCH', input, { skipAuthExpiry: true });

export async function uploadAvatar(file: File): Promise<{ user: Profile }> {
  const body = new FormData();
  body.append('file', file);
  return request<{ user: Profile }>('/me/avatar', { method: 'POST', body });
}

export const removeAvatar = () => request<{ user: Profile }>('/me/avatar', { method: 'DELETE' });

/**
 * 头像端点需要 Bearer，`<img src>` 带不上令牌，因此取回 Blob 由调用方转 object URL。
 * 与文档资产（documents.ts 的 fetchDocumentAsset）同款做法。
 */
export async function fetchAvatarBlob(): Promise<Blob> {
  const built = buildRequest('/me/avatar');
  let response: Response;
  try {
    response = await fetch(built.url, built.init);
  } catch (error) {
    throw new ApiRequestError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Avatar request failed',
    });
  }
  if (!response.ok) throw await responseError(response);
  return response.blob();
}