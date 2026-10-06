import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNeighborhood, suggestEntities } from '@/api/graph';
import { searchKnowledge } from '@/api/retrieval';
import { clearSearchHistory, deleteSearchHistory, listSearchHistory } from '@/api/search-history';
import type { EntityType } from '@/types/domain';
import { toSearchRequest, type RetrievalQueryState } from './retrieval-schema';

export const SEARCH_HISTORY_QUERY_KEY = ['search-history'] as const;

/** 无限查询缓存键：条件任一项变化都会重新从第 1 页拉取。 */
export function retrievalQueryKey(state: RetrievalQueryState) {
  return [
    'retrieval',
    'search',
    state.mode,
    state.query,
    state.datasetIds,
    state.sort,
    state.from,
    state.to,
    state.pageSize,
    state.entityNames,
    state.maxHops,
  ] as const;
}

export function useSearchResults(state: RetrievalQueryState) {
  const client = useQueryClient();
  const query = state.query.trim();
  const request: RetrievalQueryState = { ...state, query };

  return useInfiniteQuery({
    queryKey: retrievalQueryKey(request),
    queryFn: async ({ pageParam }) => {
      const response = await searchKnowledge(toSearchRequest(request, pageParam));
      // 后端仅在 page === 1 时记录检索历史，前端据此刷新列表。
      if (pageParam === 1) {
        void client.invalidateQueries({ queryKey: SEARCH_HISTORY_QUERY_KEY });
      }
      return response;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.page + 1 : undefined),
    enabled: query.length > 0,
  });
}

export function useSearchHistory(limit = 20) {
  return useQuery({
    queryKey: [...SEARCH_HISTORY_QUERY_KEY, limit],
    queryFn: () => listSearchHistory(limit),
    staleTime: 0,
  });
}

export function useDeleteSearchHistory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSearchHistory(id),
    onSuccess: () => client.invalidateQueries({ queryKey: SEARCH_HISTORY_QUERY_KEY }),
  });
}

export function useClearSearchHistory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => clearSearchHistory(),
    onSuccess: () => client.invalidateQueries({ queryKey: SEARCH_HISTORY_QUERY_KEY }),
  });
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** 实体联想：300ms 防抖，仅在图谱模式且至少输入 1 个字符时请求。 */
export function useEntitySuggestions(input: {
  q: string;
  enabled: boolean;
  types?: EntityType[];
  limit?: number;
  /** 允许空查询：留空返回热门实体，用于图谱模式的空白引导。 */
  allowEmpty?: boolean;
}) {
  const debounced = useDebouncedValue(input.q.trim(), 300);
  const limit = input.limit ?? 20;
  return useQuery({
    queryKey: ['retrieval', 'graph', 'entities', debounced, input.types ?? [], limit],
    queryFn: () => suggestEntities({ q: debounced, types: input.types, limit }),
    enabled: input.enabled && (input.allowEmpty === true || debounced.length >= 1),
    staleTime: 60_000,
  });
}

/** 图谱基础邻域：过滤只在前端生效，因此查询键不含类型筛选，避免切换筛选时重发请求。 */
export function useGraphNeighborhood(input: {
  entity: string;
  maxHops: number;
  datasetIds: string[];
  enabled: boolean;
}) {
  const entity = input.entity.trim();
  return useQuery({
    queryKey: ['retrieval', 'graph', 'neighborhood', entity, input.maxHops, input.datasetIds],
    queryFn: () => fetchNeighborhood({ entity, maxHops: input.maxHops, datasetIds: input.datasetIds, limit: 120 }),
    enabled: input.enabled && entity.length > 0,
  });
}
