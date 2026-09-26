import { listConversations } from '../../services/chat';
import { listDatasets } from '../../services/datasets';
import { listInterviewSessions } from '../../services/interview';
import { ensureAuthenticated } from '../../utils/auth-guard';
import { showRequestError } from '../../utils/feedback';
import { SessionKind, SessionListItem } from '../../types/session-list';
import { filterSessions, mergeSessionItems } from '../../utils/sessions';
import { rememberInterviewSessionId } from '../../utils/interview-navigation';

Page({
  data: {
    sessions: [] as SessionListItem[],
    visibleSessions: [] as SessionListItem[],
    filter: 'all' as SessionKind | 'all',
    loading: true,
    error: '',
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    void this.loadSessions();
  },

  async loadSessions() {
    this.setData({ loading: true, error: '' });
    try {
      const [datasets, conversations, interviews] = await Promise.all([
        listDatasets(),
        listConversations(),
        listInterviewSessions(),
      ]);
      const sessions = mergeSessionItems(
        conversations.items,
        interviews.items,
        datasets.items
      );
      this.setData({
        sessions,
        visibleSessions: filterSessions(sessions, this.data.filter),
      });
    } catch (error) {
      this.setData({ error: '无法加载会话记录' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  selectFilter(event: WechatMiniprogram.BaseEvent) {
    const filter = event.currentTarget.dataset.filter as SessionKind | 'all';
    this.setData({
      filter,
      visibleSessions: filterSessions(this.data.sessions, filter),
    });
  },

  openSession(event: WechatMiniprogram.BaseEvent) {
    const session = event.currentTarget.dataset.session as SessionListItem;
    if (session.kind === 'chat') {
      wx.navigateTo({ url: `/pages/chat/chat?conversationId=${session.id}` });
      return;
    }
    rememberInterviewSessionId(session.id);
    wx.switchTab({
      url: '/pages/interview/interview',
      fail: (error) => {
        wx.showToast({
          title: error.errMsg || '无法打开面试训练',
          icon: 'none',
        });
      },
    });
  },
});
