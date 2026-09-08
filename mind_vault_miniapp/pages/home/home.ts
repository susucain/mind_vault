import { getHealth } from '../../services/system';
import { ensureAuthenticated } from '../../utils/auth-guard';

Page({
  data: {
    health: '',
    loading: true,
    error: '',
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    void this.loadHealth();
  },

  async loadHealth() {
    this.setData({ loading: true, error: '' });
    try {
      const result = await getHealth();
      this.setData({ health: result.status });
    } catch {
      this.setData({ error: '暂时无法连接知识库服务' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openLibrary() {
    wx.switchTab({ url: '/pages/library/library' });
  },

  openInterview() {
    wx.switchTab({ url: '/pages/interview/interview' });
  },

  openChat() {
    wx.navigateTo({ url: '/pages/chat/chat' });
  },
});
