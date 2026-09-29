import { useQuery } from '@tanstack/react-query';
import { listDatasets } from '../../api/datasets';
import { listDocuments } from '../../api/documents';
import { appConfig } from '../../lib/config';
import { mockDocuments } from '../overview/mock-data';

export function useDocuments(datasetId?: string) {
  return useQuery({
    queryKey: ['documents', { datasetId }],
    queryFn: () => appConfig.enableMockApi
      ? Promise.resolve({
          items: datasetId ? mockDocuments.filter(() => datasetId === 'mock-d1' || datasetId === 'mock-d2') : mockDocuments,
          page: 1,
          pageSize: 100,
          total: mockDocuments.length,
        })
      : listDocuments({ datasetId: datasetId || undefined, page: 1, pageSize: 100 }),
  });
}

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: () => listDatasets({ page: 1, pageSize: 100 }),
  });
}
