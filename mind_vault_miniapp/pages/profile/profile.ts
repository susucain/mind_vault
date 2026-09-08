import { clearSession, loadSession } from '../../utils/session';
import { ensureAuthenticated } from '../../utils/auth-guard';
import { getRequestTraces } from '../../utils/telemetry';

Page({
  data: {
    userId: '',
    nickname: '',
    lastRequest: '',
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    const session = loadSession();
    this.setData({
      userId: session?.user.id ?? '',
      nickname: session?.user.nickname ?? '未登录',
      lastRequest: formatLatestTrace(),
    });
  },

  logout() {
    clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});

function formatLatestTrace() {
  const trace = getRequestTraces()[0];
  if (!trace) return '暂无请求记录';
  const status = trace.statusCode ? `${trace.statusCode}` : '网络失败';
  return `${trace.method} ${trace.path} · ${status} · ${trace.durationMs}ms`;
}
