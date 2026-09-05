import {
  deleteDocument,
  DocumentDetail,
  getDocument,
} from '../../services/documents';
import { ensureAuthenticated } from '../../utils/auth-guard';
import { showRequestError } from '../../utils/feedback';

Page({
  data: {
    document: null as DocumentDetail | null,
    loading: true,
    error: '',
    deleting: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query.id;
    if (!id) {
      this.setData({ loading: false, error: '缺少文档 ID' });
      return;
    }
    if (!ensureAuthenticated()) return;
    void this.loadDocument(id);
  },

  async loadDocument(id: string) {
    this.setData({ loading: true, error: '' });
    try {
      const document = await getDocument(id);
      this.setData({ document });
      wx.setNavigationBarTitle({ title: document.title });
    } catch (error) {
      this.setData({ error: '无法加载文档详情' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  confirmDelete() {
    const document = this.data.document;
    if (!document || this.data.deleting) return;
    wx.showModal({
      title: '删除文档',
      content: '文档会立即从知识库中隐藏，并异步清理相关索引。',
      confirmColor: '#c65353',
      success: async (result) => {
        if (!result.confirm) return;
        this.setData({ deleting: true });
        try {
          await deleteDocument(document.id);
          wx.showToast({ title: '已提交删除', icon: 'success' });
          wx.navigateBack();
        } catch (error) {
          showRequestError(error);
        } finally {
          this.setData({ deleting: false });
        }
      },
    });
  },
});
