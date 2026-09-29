import { QueryClient } from '@tanstack/react-query';

type RetryableError = {
  status?: number;
};

export function shouldRetry(failureCount: number, error: unknown) {
  const status = (error as RetryableError | null)?.status;

  if (status === 401 || status === 403) {
    return false;
  }

  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
    },
  },
});
