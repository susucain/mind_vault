import { useQuery } from '@tanstack/react-query';
import { listConversations } from '../../api/conversations';
import { listDocuments } from '../../api/documents';
import { listInterviewSessions, listReviewItems } from '../../api/interview';
import { appConfig } from '../../lib/config';
import { mockDocuments, mockReviewItems, mockSessions } from './mock-data';

export function useRecentDocuments() {
  return useQuery({
    queryKey: ['overview', 'recent-documents'],
    queryFn: () => appConfig.enableMockApi
      ? Promise.resolve({ items: mockDocuments, page: 1, pageSize: 5, total: mockDocuments.length })
      : listDocuments({ page: 1, pageSize: 5 }),
  });
}

export function useDocumentCount() {
  return useQuery({
    queryKey: ['overview', 'document-count'],
    queryFn: () => appConfig.enableMockApi
      ? Promise.resolve(mockDocuments.length)
      : listDocuments({ page: 1, pageSize: 1 }).then((response) => response.total),
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ['overview', 'conversations'],
    queryFn: listConversations,
  });
}

export function useContinueInterview() {
  return useQuery({
    queryKey: ['overview', 'continue-interview'],
    queryFn: async () => {
      const sessions = appConfig.enableMockApi ? mockSessions : await listInterviewSessions();
      return sessions.filter((session) => ['active', 'created', 'in_progress', 'in-progress'].includes(session.status.toLowerCase()));
    },
  });
}

export function usePendingReviewItems() {
  return useQuery({
    queryKey: ['overview', 'review-items'],
    queryFn: () => appConfig.enableMockApi
      ? Promise.resolve({ items: mockReviewItems, page: 1, pageSize: 5, total: mockReviewItems.length })
      : listReviewItems({ status: 'PENDING', page: 1, pageSize: 5 }),
  });
}
