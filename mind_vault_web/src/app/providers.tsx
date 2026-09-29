import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../stores/auth.store';
import { useAppStore } from '../stores/app.store';

export function AppProviders({ children }: PropsWithChildren) {
  const hydrateAuth = useAuthStore((state) => state.hydrate);
  const hydrateApp = useAppStore((state) => state.hydrate);

  useEffect(() => {
    hydrateAuth();
    hydrateApp();
  }, [hydrateApp, hydrateAuth]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
