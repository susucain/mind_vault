import { environment } from '../config/env';
import { UserSession } from '../types/session';
import { request } from './request';

export function devLogin() {
  return request<UserSession, { userId: string; nickname: string }>({
    path: '/auth/dev-login',
    method: 'POST',
    skipAuth: true,
    data: {
      userId: '10001',
      nickname: '开发用户',
    },
  });
}

export function wechatLogin(): Promise<UserSession> {
  return new Promise((resolve, reject) => {
    wx.login({
      async success(result) {
        if (!result.code) {
          reject(new Error('微信登录未返回 code'));
          return;
        }
        try {
          const session = await request<UserSession, { code: string }>({
            path: '/auth/wechat',
            method: 'POST',
            skipAuth: true,
            data: { code: result.code },
          });
          resolve(session);
        } catch {
          reject(new Error('微信登录服务尚未开放'));
        }
      },
      fail: reject,
    });
  });
}

export function login() {
  return environment.useDevLogin ? devLogin() : wechatLogin();
}
