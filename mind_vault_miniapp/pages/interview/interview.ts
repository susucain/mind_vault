import { ensureAuthenticated } from '../../utils/auth-guard';

Page({
  data: {},

  onShow() {
    ensureAuthenticated();
  },

  startSession() {
    wx.showToast({
      title: '训练流程将在 F6 实现',
      icon: 'none',
    });
  },
});
