import { AppOption } from '../types/app';
import { clearSession, loadSession } from './session';

const LOGIN_PAGE = '/pages/login/login';

export function ensureAuthenticated(): boolean {
  const session = loadSession();
  if (session) return true;
  wx.reLaunch({ url: LOGIN_PAGE });
  return false;
}

export function isAuthenticated(): boolean {
  return Boolean(loadSession());
}

export function handleUnauthorized() {
  clearSession();
  wx.reLaunch({ url: LOGIN_PAGE });
}

export function updateAppSession() {
  getApp<AppOption>().globalData.session = loadSession();
}
