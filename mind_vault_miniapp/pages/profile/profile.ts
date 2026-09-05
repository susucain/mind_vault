import { clearSession, loadSession } from '../../utils/session';
import { ensureAuthenticated } from '../../utils/auth-guard';

Page({
  data: {
    userId: '',
    nickname: '',
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    const session = loadSession();
    this.setData({
      userId: session?.user.id ?? '',
      nickname: session?.user.nickname ?? '未登录',
    });
  },

  logout() {
    clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
