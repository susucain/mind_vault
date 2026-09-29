import { QueryClient } from '@tanstack/react-query';

type RetryableError = {
  status?: number;
};

export function shouldRetry(failureCount: number, error: unknown) {
  const status = (error as RetryableError | null)?.status;

  const retryableStatus =
    status === undefined ||
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599);

  if (!retryableStatus) {
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
