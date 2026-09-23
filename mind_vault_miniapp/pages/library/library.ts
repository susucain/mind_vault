import { ensureAuthenticated } from '../../utils/auth-guard';
import { createDataset, listDatasets } from '../../services/datasets';
import {
  getDocumentProcess,
  listDocuments,
  retryDocumentProcess,
  uploadDocument,
} from '../../services/documents';
import {
  Dataset,
  DocumentItem,
  DocumentProcess,
  DocumentProcessStatus,
} from '../../types/api';
import { showRequestError } from '../../utils/feedback';
import { chooseKnowledgeFile, SelectedFile } from '../../utils/file-picker';
import { selectAvailableDatasetId } from '../../utils/dataset-selection';
import {
  formatRemainingSeconds,
  graphStatusLabel,
  ingestionStatusLabel,
  isRetryableIngestionStatus,
} from '../../utils/document-ingestion';

let pollingTimer: ReturnType<typeof setTimeout> | null = null;

type LibraryDocumentItem = DocumentItem & {
  ingestionStatusLabel: string;
  canRetryIngestion: boolean;
  graphStatusLabel: string;
  graphProgressLabel: string;
};

Page({
  data: {
    datasets: [] as Dataset[],
    documents: [] as LibraryDocumentItem[],
    selectedDatasetId: '',
    loading: true,
    error: '',
    showCreateDataset: false,
    datasetName: '',
    datasetDescription: '',
    creating: false,
    uploading: false,
    uploadProgress: 0,
    uploadFileName: '',
    uploadDocumentId: '',
    uploadStatus: '' as DocumentProcessStatus | '',
    uploadStageProgress: null as DocumentProcess['stageProgress'] | null,
    uploadGraph: null as DocumentProcess['graph'] | null,
    uploadEta: '',
    uploadGraphLabel: '',
    uploadError: '',
    retryingDocumentId: '',
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    void this.loadLibrary();
    if (
      this.data.uploadDocumentId &&
      (!['READY', 'FAILED', 'DELETED'].includes(this.data.uploadStatus) ||
        this.data.uploadGraph?.status === 'PROCESSING')
    ) {
      void this.pollDocumentStatus(this.data.uploadDocumentId);
    }
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  async loadLibrary() {
    this.setData({ loading: true, error: '' });
    try {
      const datasets = (await listDatasets()).items;
      const selectedDatasetId = selectAvailableDatasetId(
        this.data.selectedDatasetId,
        datasets,
      );
      const documents = withIngestionState(
        (await listDocuments(selectedDatasetId)).items,
      );
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
      const documents = withIngestionState(
        (await listDocuments(datasetId)).items,
      );
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
      const documents = withIngestionState(
        (await listDocuments(dataset.id)).items,
      );
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

  async chooseAndUpload() {
    if (!this.data.selectedDatasetId) {
      wx.showToast({ title: '请先新建资料集', icon: 'none' });
      return;
    }
    let file: SelectedFile;
    try {
      file = await chooseKnowledgeFile();
    } catch (error) {
      if (error instanceof Error && error.message === '已取消选择文件') return;
      showRequestError(error);
      return;
    }
    this.stopPolling();
    this.setData({
      uploading: true,
      uploadProgress: 0,
      uploadFileName: file.name,
      uploadDocumentId: '',
      uploadStatus: 'UPLOADED',
      uploadError: '',
    });
    try {
      const result = await uploadDocument(
        file,
        this.data.selectedDatasetId,
        (uploadProgress) => this.setData({ uploadProgress })
      );
      this.setData({
        uploadDocumentId: result.documentId,
        uploadStatus: result.status,
      });
      void this.pollDocumentStatus(result.documentId);
      await this.loadLibrary();
    } catch (error) {
      this.setData({
        uploadStatus: 'FAILED',
        uploadError:
          error instanceof Error ? error.message : '文件上传失败，请重试',
      });
      showRequestError(error);
    } finally {
      this.setData({ uploading: false });
    }
  },

  async retryUploadProcess() {
    const documentId = this.data.uploadDocumentId;
    if (!documentId) return;
    try {
      const result = await retryDocumentProcess(documentId);
      this.setData({ uploadStatus: result.status, uploadError: '' });
      void this.pollDocumentStatus(documentId);
    } catch (error) {
      showRequestError(error);
    }
  },

  async retryDocument(event: WechatMiniprogram.BaseEvent) {
    const documentId = event.currentTarget.dataset.id as string;
    if (!documentId || this.data.retryingDocumentId) return;
    this.setData({ retryingDocumentId: documentId });
    try {
      await retryDocumentProcess(documentId);
      await this.loadLibrary();
      wx.showToast({ title: '已重新提交解析', icon: 'success' });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ retryingDocumentId: '' });
    }
  },

  stopDocumentOpen() {},

  async pollDocumentStatus(documentId: string) {
    this.stopPolling();
    try {
      const process = await getDocumentProcess(documentId);
      this.setData({
        uploadStatus: process.status,
        uploadError: process.errorMessage ?? '',
        uploadStageProgress: process.stageProgress,
        uploadGraph: process.graph ?? null,
        uploadEta: formatRemainingSeconds(
          process.graph?.estimatedRemainingSeconds ??
            process.stageProgress.estimatedRemainingSeconds,
        ),
        uploadGraphLabel: graphStatusLabel(process.graph?.status),
      });
      const graphProcessing = process.graph?.status === 'PROCESSING';
      if (process.status === 'READY' && !graphProcessing) {
        await this.loadLibrary();
        return;
      }
      if (process.status === 'FAILED' || process.status === 'DELETED') return;
      if (process.status === 'READY') await this.loadLibrary();
      pollingTimer = setTimeout(() => {
        void this.pollDocumentStatus(documentId);
      }, 1500);
    } catch (error) {
      this.setData({
        uploadStatus: 'FAILED',
        uploadError: '无法获取文档处理状态',
      });
      showRequestError(error);
    }
  },

  stopPolling() {
    if (!pollingTimer) return;
    clearTimeout(pollingTimer);
    pollingTimer = null;
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

function withIngestionState(documents: DocumentItem[]): LibraryDocumentItem[] {
  return documents.map((document) => ({
    ...document,
    ingestionStatusLabel: ingestionStatusLabel(document.ingestionStatus),
    canRetryIngestion: isRetryableIngestionStatus(document.ingestionStatus),
    graphStatusLabel: graphStatusLabel(document.graph?.status),
    graphProgressLabel: document.graph
      ? `${document.graph.completed}/${document.graph.total}`
      : '',
  }));
}
