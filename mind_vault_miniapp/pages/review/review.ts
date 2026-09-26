import { ensureAuthenticated } from '../../utils/auth-guard';
import { listReviewItems } from '../../services/interview';
import { ReviewItem, ReviewStatus } from '../../types/interview';
import { showRequestError } from '../../utils/feedback';
import { appendReviewPage, hasMoreReviewItems } from '../../utils/review-state';

const PAGE_SIZE = 20;

type ReviewListItem = ReviewItem & {
  statusLabel: string;
  timeLabel: string;
};

Page({
  data: {
    activeStatus: 'PENDING' as ReviewStatus,
    items: [] as ReviewListItem[],
    page: 1,
    total: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: '',
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    void this.loadReviews(true);
  },

  switchStatus(event: WechatMiniprogram.BaseEvent) {
    const status = event.currentTarget.dataset.status as ReviewStatus;
    if (!status || status === this.data.activeStatus) return;
    this.setData({
      activeStatus: status,
      items: [],
      page: 1,
      total: 0,
      hasMore: true,
      loading: true,
      error: '',
    });
    void this.loadReviews(true);
  },

  async loadReviews(reset: boolean) {
    if (
      !reset &&
      (!this.data.hasMore || this.data.loading || this.data.loadingMore)
    )
      return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(
      reset ? { loading: true, error: '' } : { loadingMore: true, error: '' }
    );
    try {
      const response = await listReviewItems(
        this.data.activeStatus,
        page,
        PAGE_SIZE
      );
      const nextItems = response.items.map(toListItem);
      const items = reset
        ? nextItems
        : appendReviewPage(this.data.items, nextItems);
      this.setData({
        items,
        page: response.page,
        total: response.total,
        hasMore: hasMoreReviewItems(items.length, response.total),
      });
    } catch (error) {
      // 加载更多失败时保留已有列表，便于再次触底重试
      this.setData({ error: '无法加载复习列表' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  retryReviews() {
    void this.loadReviews(true);
  },

  openDetail(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/review-detail/review-detail?id=${id}`,
    });
  },

  onReachBottom() {
    void this.loadReviews(false);
  },
});

function toListItem(item: ReviewItem): ReviewListItem {
  return {
    ...item,
    statusLabel: item.status === 'COMPLETED' ? '已复习' : '待复习',
    timeLabel: formatTime(
      item.status === 'COMPLETED'
        ? item.completedAt || item.lastReviewedAt || item.createdAt
        : item.createdAt
    ),
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
