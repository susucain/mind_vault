import { jsonRequest } from './client';
import { appConfig } from '../lib/config';
import type { GraphView, RetrievalMode, RetrievalSort, RetrievalSource, SearchResultItem } from '../types/domain';

export interface SearchRequest {
  query: string;
  mode: RetrievalMode;
  datasetIds?: string[];
  sort?: RetrievalSort;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  entityNames?: string[];
  maxHops?: number;
}

export interface SearchResponse {
  mode: RetrievalMode;
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  /** 结果被后端截断（如向量 kNN 上限），此时 hasNext 恒为 false */
  truncated: boolean;
  tookMs: number;
  stats: { bySource: Partial<Record<RetrievalSource, number>>; topScore: number };
  /** 仅 hybrid 返回，标识本次实际用到的检索通道 */
  usedTools?: RetrievalSource[];
  /** 仅 graph / hybrid 返回 */
  graph?: GraphView;
}

function mockItem(index: number, mode: RetrievalMode, query: string): SearchResultItem {
  const hit: SearchResultItem['highlight'] = query
    ? [{ text: query, hit: true }, { text: '……相关片段……', hit: false }]
    : null;
  return {
    chunkId: `mock-chunk-${index}`,
    documentId: 'mock-d1',
    documentTitle: '检索结果示例文档',
    datasetIds: ['mock-d1'],
    datasetNames: ['技术资料'],
    text: `${query || '示例'} 的命中片段……`,
    highlight: mode === 'keyword' ? hit : null,
    parentContext: '',
    locator: { page: index, lineStart: 1, lineEnd: 8 },
    titlePath: ['示例章节'],
    score: Number((0.95 - index * 0.07).toFixed(2)),
    scoreKind: mode === 'vector' ? 'cosine_similarity' : 'normalized_bm25',
    sources: mode === 'vector' ? ['vector'] : ['keyword'],
  };
}

function mockSearch(input: SearchRequest): SearchResponse {
  const pageSize = input.pageSize ?? 10;
  const total = 12;
  const items = Array.from({ length: Math.min(pageSize, Math.max(total - (input.page! - 1) * pageSize, 0)) }, (_, index) =>
    mockItem((input.page! - 1) * pageSize + index + 1, input.mode, input.query),
  );
  return {
    mode: input.mode,
    items,
    total,
    page: input.page ?? 1,
    pageSize,
    hasNext: (input.page ?? 1) * pageSize < total,
    truncated: false,
    tookMs: 42,
    stats: { bySource: { [input.mode === 'vector' ? 'vector' : 'keyword']: total }, topScore: 0.95 },
  };
}

/** 统一检索：三路（关键字 / 语义 / 图谱）由后端按 mode 分派并返回统一结构。 */
export async function searchKnowledge(input: SearchRequest): Promise<SearchResponse> {
  const payload: SearchRequest = {
    query: input.query,
    mode: input.mode,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 10,
    ...(input.datasetIds?.length ? { datasetIds: input.datasetIds } : {}),
    ...(input.sort ? { sort: input.sort } : {}),
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
    ...(input.entityNames?.length ? { entityNames: input.entityNames } : {}),
    ...(input.maxHops ? { maxHops: input.maxHops } : {}),
  };
  if (appConfig.enableMockApi) return mockSearch(payload);
  return jsonRequest<SearchResponse>('/retrieval/search', 'POST', payload);
}
