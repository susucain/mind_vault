import { create } from 'zustand';
import { setAccessTokenProvider } from '../api/client';
import type { AuthUser } from '../api/auth';
import { readStoredValue, removeStoredValue, writeStoredValue } from '../lib/storage';

const STORAGE_KEY = 'mind-vault.auth';

interface StoredAuth {
  token: string;
  user: AuthUser;
}

interface AuthState {
  token?: string;
  user?: AuthUser;
  hydrated: boolean;
  setSession: (session: StoredAuth) => void;
  hydrate: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  setSession: (session) => {
    writeStoredValue(STORAGE_KEY, session);
    set({ ...session, hydrated: true });
  },
  hydrate: () => {
    const stored = readStoredValue<StoredAuth>(STORAGE_KEY);
    set(stored ? { ...stored, hydrated: true } : { token: undefined, user: undefined, hydrated: true });
  },
  clear: () => {
    removeStoredValue(STORAGE_KEY);
    set({ token: undefined, user: undefined, hydrated: true });
  },
}));

setAccessTokenProvider(() => useAuthStore.getState().token);
