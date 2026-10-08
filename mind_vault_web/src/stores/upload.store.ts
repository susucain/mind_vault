import { create } from 'zustand';
import type { DocumentGraphProgress } from '../types/domain';

export type UploadQueueStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled';

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
  errorMessage?: string;
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
