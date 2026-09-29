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
  failedStage?: string;
  errorMessage?: string;
}

interface UploadState {
  items: QueuedUpload[];
  add: (items: QueuedUpload[]) => void;
  update: (localId: string, patch: Partial<QueuedUpload>) => void;
  reset: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  items: [],
  add: (items) => set((state) => ({ items: [...state.items, ...items] })),
  update: (localId, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    })),
  reset: () => set({ items: [] }),
}));
