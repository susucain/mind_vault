import { ensureAuthenticated } from '../../utils/auth-guard';
import { createDataset, listDatasets } from '../../services/datasets';
import {
  getDocumentProcess,
  getDatasetDocumentStats,
  listDocuments,
  retryDocumentProcess,
  streamLibraryDocumentProgress,
  uploadDocument,
} from '../../services/documents';
import {
  Dataset,
  DocumentItem,
  DocumentProcess,
  DocumentProgressEvent,
  DocumentProcessStatus,
} from '../../types/api';
import { showRequestError } from '../../utils/feedback';
import { chooseKnowledgeFile, SelectedFile } from '../../utils/file-picker';
import { selectAvailableDatasetId } from '../../utils/dataset-selection';
import {
  buildUploadDisplayState,
  formatRemainingSeconds,
  graphStatusLabel,
  ingestionStatusLabel,
  isTerminalIngestionStatus,
  isRetryableIngestionStatus,
} from '../../utils/document-ingestion';
import { appendDocumentPage } from '../../utils/document-pagination';

let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let progressStream: { abort: () => void } | null = null;
let progressReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let libraryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let datasetSearchTimer: ReturnType<typeof setTimeout> | null = null;
let statusRequestInFlight = false;
const STATUS_FALLBACK_INTERVAL_MS = 10_000;
const RECENT_DATASETS_KEY = 'mind_vault_recent_datasets';

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
    selectedDatasetName: '',
    recentDatasets: [] as Dataset[],
    documentPage: 1,
    totalDocuments: 0,
    availableDocuments: 0,
    processingDocuments: 0,
    hasMoreDocuments: false,
    loadingMoreDocuments: false,
    showDatasetSelector: false,
    datasetQuery: '',
    datasetResults: [] as Dataset[],
    searchingDatasets: false,
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
    showMainIngestionProgress: false,
    showGraphProgress: false,
    uploadError: '',
    retryingDocumentId: '',
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    void this.loadLibrary();
    this.subscribeProgress();
    if (
      this.data.uploadDocumentId &&
      (!['READY', 'FAILED', 'DELETED'].includes(this.data.uploadStatus) ||
        this.data.uploadGraph?.status === 'PROCESSING')
    ) {
      void this.refreshDocumentSnapshot(this.data.uploadDocumentId);
    }
  },

  onHide() {
    this.stopPolling();
    this.stopProgressStream();
  },

  onUnload() {
    this.stopPolling();
    this.stopProgressStream();
  },

  async loadLibrary() {
    this.setData({ loading: true, error: '' });
    try {
      const datasets = (await listDatasets()).items;
      const selectedDatasetId = selectAvailableDatasetId(
        this.data.selectedDatasetId,
        datasets
      );
      this.setData({
        datasets,
        selectedDatasetId,
        selectedDatasetName:
          datasets.find((dataset) => dataset.id === selectedDatasetId)?.name ??
          '',
        recentDatasets: recentDatasets(datasets),
      });
      await this.loadDocuments(true);
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
      await this.selectDatasetById(datasetId);
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
      await this.selectDatasetById(dataset.id);
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
      uploadStageProgress: null,
      uploadGraph: null,
      uploadEta: '',
      uploadGraphLabel: '',
      showMainIngestionProgress: true,
      showGraphProgress: false,
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
      void this.refreshDocumentSnapshot(result.documentId);
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
      void this.refreshDocumentSnapshot(documentId);
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
      await this.loadDocuments(true);
      wx.showToast({ title: '已重新提交解析', icon: 'success' });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ retryingDocumentId: '' });
    }
  },

  stopDocumentOpen() {},

  toggleDatasetSelector() {
    const showDatasetSelector = !this.data.showDatasetSelector;
    if (!showDatasetSelector && datasetSearchTimer) {
      clearTimeout(datasetSearchTimer);
      datasetSearchTimer = null;
    }
    this.setData({
      showDatasetSelector,
      datasetQuery: '',
      datasetResults: showDatasetSelector ? this.data.datasets.slice(0, 6) : [],
    });
  },

  updateDatasetQuery(event: WechatMiniprogram.CustomEvent) {
    const datasetQuery = inputValue(event.detail);
    this.setData({ datasetQuery, searchingDatasets: true });
    if (datasetSearchTimer) clearTimeout(datasetSearchTimer);
    datasetSearchTimer = setTimeout(() => {
      datasetSearchTimer = null;
      void listDatasets({ name: datasetQuery, pageSize: 20 })
        .then((response) =>
          this.setData({
            datasetResults: response.items,
            searchingDatasets: false,
          })
        )
        .catch(() => this.setData({ searchingDatasets: false }));
    }, 300);
  },

  async selectDatasetResult(event: WechatMiniprogram.BaseEvent) {
    const datasetId = event.currentTarget.dataset.id as string;
    await this.selectDatasetById(datasetId);
    this.setData({
      showDatasetSelector: false,
      datasetQuery: '',
      datasetResults: [],
    });
  },

  async selectDatasetById(datasetId: string) {
    if (!datasetId) return;
    this.setData({
      selectedDatasetId: datasetId,
      selectedDatasetName:
        this.data.datasets.find((dataset) => dataset.id === datasetId)?.name ??
        '',
      documentPage: 1,
    });
    rememberDataset(datasetId, this.data.datasets);
    this.setData({ recentDatasets: recentDatasets(this.data.datasets) });
    await this.loadDocuments(true);
  },

  async loadDocuments(reset: boolean) {
    if (!this.data.selectedDatasetId) return;
    if (
      !reset &&
      (!this.data.hasMoreDocuments || this.data.loadingMoreDocuments)
    )
      return;
    const page = reset ? 1 : this.data.documentPage;
    this.setData({ loadingMoreDocuments: !reset });
    try {
      const [response, stats] = await Promise.all([
        listDocuments(this.data.selectedDatasetId, page, 10),
        reset
          ? getDatasetDocumentStats(this.data.selectedDatasetId)
          : Promise.resolve(null),
      ]);
      const merged = appendDocumentPage(
        this.data.documents,
        withIngestionState(response.items),
        page,
        10
      );
      this.setData({
        documents: merged.items,
        documentPage: merged.nextPage,
        hasMoreDocuments: merged.hasMore,
        totalDocuments: stats?.total ?? this.data.totalDocuments,
        availableDocuments: stats?.available ?? this.data.availableDocuments,
        processingDocuments: stats?.processing ?? this.data.processingDocuments,
      });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ loadingMoreDocuments: false });
    }
  },

  onReachBottom() {
    void this.loadDocuments(false);
  },

  async refreshDocumentSnapshot(documentId: string) {
    if (statusRequestInFlight || !documentId) return;
    statusRequestInFlight = true;
    try {
      const process = await getDocumentProcess(documentId);
      this.applyDocumentProcess(process);
      if (isTerminalIngestionStatus(process.status)) this.stopPolling();
    } catch (error) {
      this.setData({
        uploadStatus: 'FAILED',
        uploadError: '无法获取文档处理状态',
      });
      showRequestError(error);
    } finally {
      statusRequestInFlight = false;
    }
  },

  applyDocumentProcess(process: DocumentProcess) {
    const graph = process.graph ?? null;
    this.setData({
      uploadStatus: process.status,
      uploadError: process.errorMessage ?? '',
      uploadStageProgress: process.stageProgress,
      uploadGraph: graph,
      uploadEta: formatRemainingSeconds(
        graph?.estimatedRemainingSeconds ??
          process.stageProgress.estimatedRemainingSeconds
      ),
      uploadGraphLabel: graphStatusLabel(graph?.status),
      ...buildUploadDisplayState(process.status, graph),
    });
  },

  applyProgressEvent(event: DocumentProgressEvent) {
    const graph = event.graph ?? this.data.uploadGraph;
    const status =
      event.stage === 'graph' ? this.data.uploadStatus : event.status;
    this.setData({
      uploadStatus: status,
      uploadError: event.errorMessage ?? this.data.uploadError,
      uploadStageProgress:
        event.stage === 'graph'
          ? this.data.uploadStageProgress
          : {
              completed: event.completed,
              total: event.total,
              percent: event.percent,
              estimatedRemainingSeconds: null,
            },
      uploadGraph: graph,
      uploadEta: formatRemainingSeconds(
        graph?.estimatedRemainingSeconds ??
          this.data.uploadStageProgress?.estimatedRemainingSeconds
      ),
      uploadGraphLabel: graphStatusLabel(graph?.status),
      ...buildUploadDisplayState(status, graph),
    });
    if (isTerminalIngestionStatus(status)) this.stopPolling();
  },

  startFallbackPolling() {
    this.stopPolling();
    const documentId = this.data.uploadDocumentId;
    if (!documentId || isTerminalIngestionStatus(this.data.uploadStatus))
      return;
    pollingTimer = setTimeout(async () => {
      pollingTimer = null;
      await this.refreshDocumentSnapshot(documentId);
      this.startFallbackPolling();
    }, STATUS_FALLBACK_INTERVAL_MS);
  },

  stopPolling() {
    if (!pollingTimer) return;
    clearTimeout(pollingTimer);
    pollingTimer = null;
  },

  subscribeProgress() {
    this.stopProgressStream();
    const documentId = this.data.uploadDocumentId;
    if (documentId && !isTerminalIngestionStatus(this.data.uploadStatus)) {
      void this.refreshDocumentSnapshot(documentId);
    }
    progressStream = streamLibraryDocumentProgress(
      (event) => {
        if (event.event !== 'progress') return;
        const documentId =
          typeof event.data.documentId === 'string'
            ? event.data.documentId
            : '';
        if (documentId && documentId === this.data.uploadDocumentId) {
          const progress = documentProgressEvent(event.data);
          if (progress) this.applyProgressEvent(progress);
          this.stopPolling();
        }
        if (libraryRefreshTimer) clearTimeout(libraryRefreshTimer);
        libraryRefreshTimer = setTimeout(() => {
          libraryRefreshTimer = null;
          void this.loadDocuments(true);
        }, 300);
      },
      () => {
        if (!this.data.selectedDatasetId) {
          return;
        }
        this.startFallbackPolling();
        progressReconnectTimer = setTimeout(() => {
          progressReconnectTimer = null;
          this.subscribeProgress();
        }, 5_000);
      }
    );
  },

  stopProgressStream() {
    progressStream?.abort();
    progressStream = null;
    if (progressReconnectTimer) clearTimeout(progressReconnectTimer);
    progressReconnectTimer = null;
    if (libraryRefreshTimer) clearTimeout(libraryRefreshTimer);
    libraryRefreshTimer = null;
    if (datasetSearchTimer) clearTimeout(datasetSearchTimer);
    datasetSearchTimer = null;
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

function documentProgressEvent(
  data: Record<string, unknown>
): DocumentProgressEvent | null {
  const status = data.status;
  const documentId = data.documentId;
  const stage = data.stage;
  const completed = data.completed;
  const total = data.total;
  const percent = data.percent;
  if (
    typeof status !== 'string' ||
    typeof documentId !== 'string' ||
    typeof stage !== 'string' ||
    typeof completed !== 'number' ||
    typeof total !== 'number' ||
    typeof percent !== 'number'
  ) {
    return null;
  }
  return {
    documentId,
    stage,
    status: status as DocumentProcessStatus,
    completed,
    total,
    percent,
    errorCode: typeof data.errorCode === 'string' ? data.errorCode : null,
    errorMessage:
      typeof data.errorMessage === 'string' ? data.errorMessage : null,
    graph:
      data.graph && typeof data.graph === 'object'
        ? (data.graph as DocumentProgressEvent['graph'])
        : null,
  };
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

function recentDatasets(datasets: Dataset[]) {
  const ids = wx.getStorageSync(RECENT_DATASETS_KEY) as unknown;
  let recentIds = Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string')
    : datasets?.map((dataset) => dataset.id)?.slice(0, 3) || [];
  return recentIds
    .map((id) => datasets.find((dataset) => dataset.id === id))
    .filter((dataset): dataset is Dataset => Boolean(dataset))
    .slice(0, 3);
}

function rememberDataset(id: string, datasets: Dataset[]) {
  const stored = wx.getStorageSync(RECENT_DATASETS_KEY) as unknown;
  const existing = Array.isArray(stored)
    ? stored.filter((value): value is string => typeof value === 'string')
    : datasets?.map((dataset) => dataset.id)?.slice(0, 3) || [];

  if (existing.includes(id)) return;
  wx.setStorageSync(
    RECENT_DATASETS_KEY,
    [id, ...existing.filter((value) => value !== id)].slice(0, 3)
  );
}
