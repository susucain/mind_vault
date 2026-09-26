import { ensureAuthenticated } from '../../utils/auth-guard';
import {
  getReviewItem,
  submitReviewAnswer,
  updateReviewItemStatus,
} from '../../services/interview';
import {
  ReviewAttempt,
  ReviewDetail,
  ReviewStatus,
} from '../../types/interview';
import { showRequestError } from '../../utils/feedback';
import { topicLabel } from '../../utils/interview-labels';
import { reviewScoreLabel } from '../../utils/review-state';

type ReviewAttemptView = ReviewAttempt & {
  order: number;
  scoreLabel: string;
  timeLabel: string;
};

Page({
  data: {
    id: '',
    detail: null as ReviewDetail | null,
    sourceTopicLabel: '',
    attempts: [] as ReviewAttemptView[],
    lastAttempt: null as ReviewAttemptView | null,
    answer: '',
    resultMessage: '',
    submitting: false,
    statusUpdating: false,
    loading: true,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query.id ?? '';
    if (!id) {
      this.setData({ loading: false, error: '缺少复习项 ID' });
      return;
    }
    if (!ensureAuthenticated()) return;
    this.setData({ id });
    void this.loadReviewDetail(id);
  },

  async loadReviewDetail(id: string) {
    this.setData({ loading: true, error: '' });
    try {
      const detail = await getReviewItem(id);
      const attempts = detail.attempts.map((attempt, index) =>
        toAttemptView(attempt, index + 1)
      );
      this.setData({
        detail,
        sourceTopicLabel: detail.sourceTopic
          ? topicLabel(detail.sourceTopic)
          : '未知主题',
        attempts,
        lastAttempt: attempts.length ? attempts[attempts.length - 1] : null,
        resultMessage: '',
      });
    } catch (error) {
      this.setData({ error: '无法加载复习详情' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() {
    if (this.data.id) void this.loadReviewDetail(this.data.id);
  },

  updateAnswer(event: WechatMiniprogram.CustomEvent) {
    this.setData({ answer: inputValue(event.detail) });
  },

  async resubmitAnswer() {
    const detail = this.data.detail;
    const answer = this.data.answer.trim();
    // 拒绝空回答与重复提交
    if (!detail || !answer || this.data.submitting || this.data.statusUpdating)
      return;
    this.setData({ submitting: true });
    try {
      const result = await submitReviewAnswer(detail.item.id, answer);
      const attempt = toAttemptView(
        result.attempt,
        this.data.attempts.length + 1
      );
      this.setData({
        detail: { ...detail, item: result.item },
        attempts: [...this.data.attempts, attempt],
        lastAttempt: attempt,
        answer: '',
        resultMessage: result.autoCompleted
          ? '本次复习已完成'
          : '保留待复习，请结合反馈继续练习',
      });
    } catch (error) {
      // 失败时保留已输入的回答与当前详情
      showRequestError(error);
    } finally {
      this.setData({ submitting: false });
    }
  },

  keepAsPending() {
    if (this.data.submitting || this.data.statusUpdating) return;
    this.setData({ answer: '', resultMessage: '' });
    wx.showToast({ title: '已保留待复习，可稍后继续', icon: 'none' });
  },

  markCompleted() {
    void this.updateStatus('COMPLETED');
  },

  restorePending() {
    void this.updateStatus('PENDING');
  },

  async updateStatus(status: ReviewStatus) {
    const detail = this.data.detail;
    // 状态更新期间禁用所有状态操作
    if (!detail || this.data.statusUpdating || this.data.submitting) return;
    this.setData({ statusUpdating: true });
    try {
      const item = await updateReviewItemStatus(detail.item.id, status);
      this.setData({ detail: { ...detail, item } });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ statusUpdating: false });
    }
  },
});

function toAttemptView(
  attempt: ReviewAttempt,
  order: number
): ReviewAttemptView {
  return {
    ...attempt,
    order,
    scoreLabel: reviewScoreLabel(Number(attempt.score)),
    timeLabel: formatTime(attempt.createdAt),
  };
}

function formatTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (input: number) => `${input}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
