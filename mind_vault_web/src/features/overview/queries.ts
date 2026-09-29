import { useQuery } from '@tanstack/react-query';
import { listDatasets } from '../../api/datasets';
import { listDocuments } from '../../api/documents';
import { listInterviewSessions, listReviewItems } from '../../api/interview';
import { appConfig } from '../../lib/config';
import { mockDatasets, mockDocuments, mockReviewItems, mockSessions } from './mock-data';

export function useRecentDocuments() {
  return useQuery({
    queryKey: ['overview', 'recent-documents'],
    queryFn: () => appConfig.enableMockApi
      ? Promise.resolve({ items: mockDocuments, page: 1, pageSize: 5, total: mockDocuments.length })
      : listDocuments({ page: 1, pageSize: 5 }),
  });
}

export function useOverviewStats() {
  return useQuery({
    queryKey: ['overview', 'stats'],
    queryFn: async () => {
      if (appConfig.enableMockApi) {
        return { documents: mockDocuments.length, datasets: mockDatasets.length, ready: 2 };
      }
      const [documents, datasets] = await Promise.all([
        listDocuments({ page: 1, pageSize: 100 }),
        listDatasets({ page: 1, pageSize: 1 }),
      ]);
      return {
        documents: documents.total,
        datasets: datasets.total,
        ready: documents.items.filter((item) => item.status === 1 || item.status === 'ready').length,
      };
    },
  });
}

export function useContinueInterview() {
  return useQuery({
    queryKey: ['overview', 'continue-interview'],
    queryFn: () => appConfig.enableMockApi ? Promise.resolve(mockSessions) : listInterviewSessions(),
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
