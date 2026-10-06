import { create } from 'zustand';
import { readStoredValue, writeStoredValue } from '../lib/storage';

const STORAGE_KEY = 'mind-vault.app';

interface AppState {
  datasetIds: string[];
  theme: 'light' | 'dark' | 'system';
  commandMenuOpen: boolean;
  setDatasetIds: (datasetIds: string[]) => void;
  setTheme: (theme: AppState['theme']) => void;
  setCommandMenuOpen: (open: boolean) => void;
  /** 退出登录时清掉跟用户绑定的状态；设备级偏好（theme）保留 */
  resetUserScoped: () => void;
  hydrate: () => void;
}

type StoredApp = Pick<AppState, 'datasetIds' | 'theme'>;

function persist(state: StoredApp): void {
  writeStoredValue(STORAGE_KEY, state);
}

export const useAppStore = create<AppState>((set, get) => ({
  datasetIds: [],
  theme: 'system',
  commandMenuOpen: false,
  setDatasetIds: (datasetIds) => {
    persist({ datasetIds, theme: get().theme });
    set({ datasetIds });
  },
  setTheme: (theme) => {
    persist({ datasetIds: get().datasetIds, theme });
    set({ theme });
  },
  setCommandMenuOpen: (commandMenuOpen) => set({ commandMenuOpen }),
  resetUserScoped: () => {
    persist({ datasetIds: [], theme: get().theme });
    set({ datasetIds: [] });
  },
  hydrate: () => {
    const stored = readStoredValue<StoredApp>(STORAGE_KEY);
    if (stored) set(stored);
  },
}));
