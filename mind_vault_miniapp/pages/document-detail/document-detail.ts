import {
  deleteDocument,
  DocumentDetail,
  getDocument,
} from '../../services/documents';
import { ensureAuthenticated } from '../../utils/auth-guard';
import { showRequestError } from '../../utils/feedback';
import { DocumentLocator, DocumentSection } from '../../types/api';

Page({
  data: {
    document: null as DocumentDetail | null,
    loading: true,
    error: '',
    deleting: false,
    targetSectionId: '',
    quote: '',
    locatorLabel: '',
    documentStatusLabel: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query.id;
    if (!id) {
      this.setData({ loading: false, error: '缺少文档 ID' });
      return;
    }
    if (!ensureAuthenticated()) return;
    const locator = parseLocator(query.locator);
    this.setData({
      quote: decodeURIComponent(query.quote ?? ''),
      locatorLabel: formatLocator(locator),
    });
    void this.loadDocument(id, locator);
  },

  async loadDocument(id: string, locator: DocumentLocator = {}) {
    this.setData({ loading: true, error: '' });
    try {
      const document = await getDocument(id);
      this.setData({
        document,
        targetSectionId: findSection(document.sections, locator),
        documentStatusLabel: formatDocumentStatus(document.status),
      });
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

function parseLocator(value?: string): DocumentLocator {
  if (!value) return {};
  try {
    return JSON.parse(decodeURIComponent(value)) as DocumentLocator;
  } catch {
    return {};
  }
}

function findSection(sections: DocumentSection[], locator: DocumentLocator) {
  const matched = sections.find((section) => {
    if (locator.page && section.locator.page === locator.page) return true;
    if (locator.slide && section.locator.slide === locator.slide) return true;
    if (locator.sheet && section.locator.sheet === locator.sheet) return true;
    if (locator.jsonPath && section.locator.jsonPath === locator.jsonPath)
      return true;
    if (
      locator.lineStart &&
      section.locator.lineStart &&
      section.locator.lineStart <= locator.lineStart &&
      (section.locator.lineEnd ?? Number.MAX_SAFE_INTEGER) >= locator.lineStart
    )
      return true;
    return false;
  });
  return matched?.sectionId ?? '';
}

function formatLocator(locator: DocumentLocator) {
  if (locator.page) return `定位到第 ${locator.page} 页`;
  if (locator.slide) return `定位到第 ${locator.slide} 张幻灯片`;
  if (locator.sheet) return `定位到工作表：${locator.sheet}`;
  if (locator.jsonPath) return `定位到 ${locator.jsonPath}`;
  if (locator.lineStart) return `定位到第 ${locator.lineStart} 行`;
  return '';
}

function formatDocumentStatus(status: number) {
  switch (status) {
    case 1:
      return '可用';
    case 2:
      return '已归档';
    case 3:
      return '索引失败';
    default:
      return '处理中';
  }
}
