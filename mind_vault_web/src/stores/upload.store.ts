import { create } from 'zustand';
import type { DocumentGraphProgress } from '../types/domain';

export type UploadQueueStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled';

/** 409 拒绝时后端返回的既有文档引用，用于提示并高亮列表中的同内容文件 */
export interface DuplicateDocumentRef {
  id: string;
  name: string;
  createdAt?: string;
}

export interface QueuedUpload {
  localId: string;
  file: File;
  datasetId: string;
  /** 入队时选择的图谱开关，用于区分「已可问答」与「已可问答（未构建图谱）」 */
  graphEnabled?: boolean;
  status: UploadQueueStatus;
  progress: number;
  documentId?: string;
  currentStage?: string;
  stageProgress?: {
    completed: number;
    total: number;
    percent: number;
    estimatedRemainingSeconds?: number | null;
  };
  failedStage?: string;
  /** 服务端失败分类（A2）：`PARSE_SUSPECTED_SCANNED` 等，用于展示定向降级文案 */
  errorCode?: string;
  errorMessage?: string;
  /** 内容指纹命中同资料集既有文档（U3）：后端 409 拒绝时携带 */
  duplicateOf?: DuplicateDocumentRef;
  /** 图谱构建进度：job 进入 READY 后图谱仍在后台构建，队列据此继续展示 */
  graphProgress?: DocumentGraphProgress | null;
}

interface UploadState {
  items: QueuedUpload[];
  add: (items: QueuedUpload[]) => void;
  update: (localId: string, patch: Partial<QueuedUpload>) => void;
  remove: (localId: string) => void;
  reset: () => void;
}

/** 服务端 job 还没被 worker 接手的阶段：U8 档 1 只允许在这一窗口取消 */
const PENDING_STAGES = new Set(['uploaded', 'retry_pending']);

/** job 是否已真正进入处理；进入后 worker 没有阶段间检查点，无法安全取消 */
export function hasEnteredProcessing(item: QueuedUpload): boolean {
  return (
    item.status === 'processing' &&
    Boolean(item.currentStage) &&
    !PENDING_STAGES.has(item.currentStage as string)
  );
}

/** 是否可取消：尚未提交给 worker 的任务（含客户端还没发完的请求）都可取消 */
export function canCancelUpload(item: QueuedUpload): boolean {
  if (item.status === 'queued' || item.status === 'uploading') return true;
  return item.status === 'processing' && !hasEnteredProcessing(item);
}

export const useUploadStore = create<UploadState>((set) => ({
  items: [],
  add: (items) => set((state) => ({ items: [...state.items, ...items] })),
  update: (localId, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    })),
  remove: (localId) => set((state) => ({ items: state.items.filter((item) => item.localId !== localId) })),
  reset: () => set({ items: [] }),
}));
