import { useQuery } from '@tanstack/react-query';
import { listDatasets } from '../../api/datasets';
import { getSupportedFormats, listDocuments } from '../../api/documents';
import { appConfig } from '../../lib/config';
import { mockDocuments } from '../overview/mock-data';

interface DocumentsQuery {
  title?: string;
  datasetId?: string;
  page?: number;
  pageSize?: number;
}

export function useDocuments(query: DocumentsQuery = {}) {
  return useQuery({
    queryKey: ['documents', query],
    queryFn: () => appConfig.enableMockApi
      ? Promise.resolve({
          items: query.datasetId ? mockDocuments.filter(() => query.datasetId === 'mock-d1' || query.datasetId === 'mock-d2') : mockDocuments,
          page: 1,
          pageSize: query.pageSize ?? 100,
          total: mockDocuments.length,
        })
      : listDocuments({
          title: query.title || undefined,
          datasetId: query.datasetId || undefined,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 10,
        }),
  });
}

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: () => listDatasets({ page: 1, pageSize: 100 }),
  });
}

/** 可上传格式清单，缓存较久 */
export function useSupportedFormats() {
  return useQuery({
    queryKey: ['documents', 'supported-formats'],
    queryFn: getSupportedFormats,
    staleTime: 30 * 60 * 1000,
  });
}
