import { ensureAuthenticated } from '../../utils/auth-guard';
import { createDataset, listDatasets } from '../../services/datasets';
import { listDocuments } from '../../services/documents';
import { Dataset, DocumentItem } from '../../types/api';
import { showRequestError } from '../../utils/feedback';

Page({
  data: {
    datasets: [] as Dataset[],
    documents: [] as DocumentItem[],
    selectedDatasetId: '',
    loading: true,
    error: '',
    showCreateDataset: false,
    datasetName: '',
    datasetDescription: '',
    creating: false,
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    void this.loadLibrary();
  },

  async loadLibrary() {
    this.setData({ loading: true, error: '' });
    try {
      const datasets = (await listDatasets()).items;
      const selectedDatasetId =
        this.data.selectedDatasetId || datasets[0]?.id || '';
      const documents = (await listDocuments(selectedDatasetId)).items;
      this.setData({ datasets, selectedDatasetId, documents });
    } catch (error) {
      this.setData({ error: '无法加载知识库内容' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  async selectDataset(event: WechatMiniprogram.BaseEvent) {
    const datasetId = event.currentTarget.dataset.id as string;
    if (!datasetId || datasetId === this.data.selectedDatasetId) return;
    this.setData({ selectedDatasetId: datasetId, loading: true });
    try {
      const documents = (await listDocuments(datasetId)).items;
      this.setData({ documents });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  openCreateDataset() {
    this.setData({
      showCreateDataset: true,
      datasetName: '',
      datasetDescription: '',
    });
  },

  closeCreateDataset() {
    this.setData({ showCreateDataset: false });
  },

  updateDatasetName(event: WechatMiniprogram.CustomEvent) {
    this.setData({ datasetName: inputValue(event.detail) });
  },

  updateDatasetDescription(event: WechatMiniprogram.CustomEvent) {
    this.setData({ datasetDescription: inputValue(event.detail) });
  },

  async createDataset() {
    const name = this.data.datasetName.trim();
    if (!name) {
      wx.showToast({ title: '请输入资料集名称', icon: 'none' });
      return;
    }
    this.setData({ creating: true });
    try {
      const dataset = await createDataset({
        name,
        description: this.data.datasetDescription.trim() || undefined,
      });
      this.setData({
        showCreateDataset: false,
        datasets: [dataset, ...this.data.datasets],
        selectedDatasetId: dataset.id,
      });
      const documents = (await listDocuments(dataset.id)).items;
      this.setData({ documents });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ creating: false });
    }
  },

  openDocument(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/document-detail/document-detail?id=${id}`,
    });
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
