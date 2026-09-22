import { createConversation, listConversations } from '../../services/chat';
import { listDatasets } from '../../services/datasets';
import { listDocuments } from '../../services/documents';
import {
  listInterviewSessions,
  listReviewItems,
} from '../../services/interview';
import { Dataset, DocumentItem } from '../../types/api';
import { ReviewItem } from '../../types/interview';
import { SessionListItem } from '../../types/session-list';
import { ensureAuthenticated } from '../../utils/auth-guard';
import { showRequestError } from '../../utils/feedback';
import {
  allDatasetIds,
  mergeSessionItems,
  recentSessions,
} from '../../utils/sessions';

Page({
  data: {
    datasets: [] as Dataset[],
    input: '',
    recentSessions: [] as SessionListItem[],
    latestChat: null as SessionListItem | null,
    latestInterview: null as SessionListItem | null,
    documents: [] as DocumentItem[],
    reviewItems: [] as ReviewItem[],
    loading: true,
    sending: false,
    error: '',
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    void this.loadWorkbench();
  },

  async loadWorkbench() {
    this.setData({ loading: true, error: '' });
    try {
      const [datasets, conversations, interviews, documents, reviewItems] =
        await Promise.all([
          listDatasets(),
          listConversations(),
          listInterviewSessions(),
          listDocuments(),
          listReviewItems(),
        ]);
      const sessions = mergeSessionItems(
        conversations.items,
        interviews.items,
        datasets.items
      );
      this.setData({
        datasets: datasets.items,
        recentSessions: recentSessions(sessions),
        latestChat: sessions.find((item) => item.kind === 'chat') ?? null,
        latestInterview:
          sessions.find((item) => item.kind === 'interview') ?? null,
        documents: documents.items.slice(0, 2),
        reviewItems: reviewItems.slice(0, 1),
      });
    } catch (error) {
      this.setData({ error: '无法加载首页内容' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  updateInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ input: inputValue(event.detail) });
  },

  async startQuestion() {
    const question = this.data.input.trim();
    const datasetIds = allDatasetIds(this.data.datasets);
    if (!question || this.data.sending) return;
    if (!datasetIds.length) {
      wx.showToast({ title: '请先在知识库创建资料集', icon: 'none' });
      return;
    }
    this.setData({ sending: true });
    try {
      const conversation = await createConversation({
        title: question.slice(0, 28),
        datasetIds,
      });
      const sendKey = `home-chat-${Date.now()}`;
      wx.setStorageSync(sendKey, question);
      wx.navigateTo({
        url: `/pages/chat/chat?conversationId=${conversation.id}&sendKey=${sendKey}`,
      });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ sending: false });
    }
  },

  openSession(event: WechatMiniprogram.BaseEvent) {
    const session = event.currentTarget.dataset.session as SessionListItem;
    wx.navigateTo({
      url:
        session.kind === 'chat'
          ? `/pages/chat/chat?conversationId=${session.id}`
          : `/pages/interview/interview?sessionId=${session.id}`,
    });
  },

  openChat() {
    wx.navigateTo({ url: '/pages/chat/chat' });
  },

  openSessions() {
    wx.navigateTo({ url: '/pages/sessions/sessions' });
  },

  openLibrary() {
    wx.switchTab({ url: '/pages/library/library' });
  },
});

function inputValue(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (
    typeof detail === 'object' &&
    detail !== null &&
    'value' in detail &&
    typeof detail.value === 'string'
  ) {
    return detail.value;
  }
  return '';
}
