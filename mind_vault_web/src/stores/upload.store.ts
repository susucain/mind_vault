import { create } from 'zustand';

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
