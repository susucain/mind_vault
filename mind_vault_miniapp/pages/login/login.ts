import { login } from '../../services/auth';
import { AppOption } from '../../types/app';
import { saveSession } from '../../utils/session';

Page({
  data: {
    loading: false,
    error: '',
  },

  onLoad() {
    if (getApp<AppOption>().globalData.session) {
      wx.switchTab({ url: '/pages/home/home' });
    }
  },

  async handleLogin() {
    this.setData({ loading: true, error: '' });
    try {
      const session = await login();
      saveSession(session);
      wx.switchTab({ url: '/pages/home/home' });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : '登录失败，请稍后重试',
      });
    } finally {
      this.setData({ loading: false });
    }
  },
});
