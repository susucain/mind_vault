import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listInterviewSessions, type InterviewSessionList } from '../../api/interview';
import { useContinueInterview } from './queries';

vi.mock('../../api/interview', () => ({
  listInterviewSessions: vi.fn(),
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useContinueInterview', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips completed sessions and returns the next active session', async () => {
    vi.mocked(listInterviewSessions).mockResolvedValue({
      items: [
        { id: 'completed', status: 'completed', createdAt: '2026-09-30' },
        { id: 'active', status: 'active', createdAt: '2026-09-29' },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    } as unknown as InterviewSessionList);

    const { result } = renderHook(() => useContinueInterview(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([
      expect.objectContaining({ id: 'active' }),
    ]));
  });

  it('returns no sessions when all sessions are terminal', async () => {
    vi.mocked(listInterviewSessions).mockResolvedValue({
      items: [
        { id: 'completed', status: 'completed', createdAt: '2026-09-30' },
        { id: 'abandoned', status: 'abandoned', createdAt: '2026-09-29' },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    } as unknown as InterviewSessionList);

    const { result } = renderHook(() => useContinueInterview(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});
