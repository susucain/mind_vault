import { ensureAuthenticated } from '../../utils/auth-guard';

Page({
  data: {},

  onShow() {
    ensureAuthenticated();
  },

  openUpload() {
    wx.showToast({
      title: '文件上传将在 F3 实现',
      icon: 'none',
    });
  },
});
