import { clearSession, loadSession } from '../../utils/session';

Page({
  data: {
    userId: '',
    nickname: '',
  },

  onShow() {
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
