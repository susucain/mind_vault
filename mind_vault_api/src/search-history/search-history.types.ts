/** 检索历史的筛选条件快照（与 SearchQueryDto 的可复现子集一致） */
export interface SearchHistoryFilters {
  sort: 'relevance' | 'recent';
  from: string | null;
  to: string | null;
  pageSize: number;
  maxHops: number;
}

export interface SearchHistoryEntry {
  id: string;
  mode: string;
  query: string;
  datasetIds: string[];
  entityNames: string[];
  filters: SearchHistoryFilters;
  resultCount: number;
  createdAt: string;
}

export interface SearchHistoryRecordInput {
  ownerId: string;
  mode: string;
  query: string;
  datasetIds: string[];
  entityNames: string[];
  filters: SearchHistoryFilters;
  resultCount: number;
}
