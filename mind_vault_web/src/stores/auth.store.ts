import { create } from 'zustand';
import { setAccessTokenProvider, setAuthExpiredHandler } from '../api/client';
import type { AuthUser } from '../api/auth';
import { readStoredValue, removeStoredValue, writeStoredValue } from '../lib/storage';

const STORAGE_KEY = 'mind-vault.auth';
export const POST_LOGIN_REDIRECT_KEY = 'mind-vault.post-login-redirect';

type AuthExpiredRedirectHandler = (path: string) => void;

function defaultRedirect(_path: string): void {
  void _path;
  if (typeof window !== 'undefined') window.location.assign('/login');
}

let authExpiredRedirectHandler: AuthExpiredRedirectHandler = defaultRedirect;

export function setAuthExpiredRedirectHandler(handler: AuthExpiredRedirectHandler | undefined): void {
  authExpiredRedirectHandler = handler ?? defaultRedirect;
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

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
setAuthExpiredHandler(() => {
  const path = currentPath();
  writeStoredValue(POST_LOGIN_REDIRECT_KEY, path);
  useAuthStore.getState().clear();
  authExpiredRedirectHandler(path);
});
