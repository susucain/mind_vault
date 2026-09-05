import { UserSession } from '../types/session';
import { AppOption } from '../types/app';

const SESSION_KEY = 'mind-vault-session';

export function loadSession(): UserSession | null {
  return wx.getStorageSync(SESSION_KEY) || null;
}

export function saveSession(session: UserSession) {
  wx.setStorageSync(SESSION_KEY, session);
  getApp<AppOption>().globalData.session = session;
}

export function clearSession() {
  wx.removeStorageSync(SESSION_KEY);
  getApp<AppOption>().globalData.session = null;
}
