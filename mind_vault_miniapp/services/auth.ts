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
      success() {
        reject(new Error('后端微信登录尚未接入'));
      },
      fail: reject,
    });
  });
}

export function login() {
  return environment.useDevLogin ? devLogin() : wechatLogin();
}
