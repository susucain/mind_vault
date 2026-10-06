import { z } from 'zod';
import type { SearchRequest } from '@/api/retrieval';
import type { RetrievalMode, RetrievalSort, SearchHistoryEntry } from '@/types/domain';

export const RETRIEVAL_MODES = ['keyword', 'vector', 'graph', 'hybrid'] as const;
export const RETRIEVAL_SORTS = ['relevance', 'recent'] as const;
export const PAGE_SIZE_OPTIONS = [10, 20] as const;
export const MAX_HOPS_OPTIONS = [1, 2, 3] as const;

export const DEFAULT_MODE: RetrievalMode = 'keyword';
export const DEFAULT_SORT: RetrievalSort = 'relevance';
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_MAX_HOPS = 1;
export const MAX_ENTITY_NAMES = 10;
export const MAX_DATASET_IDS = 100;
export const MAX_QUERY_LENGTH = 200;

const modeSchema = z.enum(RETRIEVAL_MODES);
const sortSchema = z.enum(RETRIEVAL_SORTS);

/** 页面查询条件：以 URL 查询参数为唯一真源（见设计文档 4.4.2）。 */
export interface RetrievalQueryState {
  mode: RetrievalMode;
  query: string;
  datasetIds: string[];
  sort: RetrievalSort;
  from: string | null;
  to: string | null;
  pageSize: number;
  entityNames: string[];
  maxHops: number;
}

/** 逗号分隔列表：去空、去重、按上限截断（防止超长 URL）。 */
function parseCsvList(raw: string | null, limit: number): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const value = part.trim();
    if (value) seen.add(value);
    if (seen.size >= limit) break;
  }
  return Array.from(seen);
}

/** 仅接受可被 Date 解析的时间串（兼容 ISO8601 与 YYYY-MM-DD），否则视为未设置。 */
function parseIsoOrNull(raw: string | null): string | null {
  const value = raw?.trim();
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function parseChoice<T extends number>(options: readonly T[], raw: string | null, fallback: T): T {
  const value = Number(raw);
  return (options as readonly number[]).includes(value) ? (value as T) : fallback;
}

/** URL 查询参数 → 查询条件。非法值静默回退默认值，保证分享链接可安全打开。 */
export function parseRetrievalParams(params: URLSearchParams): RetrievalQueryState {
  const mode = modeSchema.safeParse(params.get('mode'));
  const sort = sortSchema.safeParse(params.get('sort'));
  return {
    mode: mode.success ? mode.data : DEFAULT_MODE,
    query: (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    datasetIds: parseCsvList(params.get('datasets'), MAX_DATASET_IDS),
    sort: sort.success ? sort.data : DEFAULT_SORT,
    from: parseIsoOrNull(params.get('from')),
    to: parseIsoOrNull(params.get('to')),
    pageSize: parseChoice(PAGE_SIZE_OPTIONS, params.get('pageSize'), DEFAULT_PAGE_SIZE),
    entityNames: parseCsvList(params.get('entities'), MAX_ENTITY_NAMES),
    maxHops: parseChoice(MAX_HOPS_OPTIONS, params.get('hops'), DEFAULT_MAX_HOPS),
  };
}

/** 查询条件 → URL 查询参数；默认值省略以保持链接简洁。 */
export function serializeRetrievalParams(state: Partial<RetrievalQueryState>): URLSearchParams {
  const params = new URLSearchParams();
  const query = state.query?.trim();
  if (query) params.set('q', query);
  if (state.mode && state.mode !== DEFAULT_MODE) params.set('mode', state.mode);
  if (state.datasetIds?.length) params.set('datasets', state.datasetIds.join(','));
  if (state.sort && state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  if (state.from) params.set('from', state.from);
  if (state.to) params.set('to', state.to);
  if (state.pageSize && state.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(state.pageSize));
  if (state.entityNames?.length) params.set('entities', state.entityNames.join(','));
  if (state.maxHops && state.maxHops !== DEFAULT_MAX_HOPS) params.set('hops', String(state.maxHops));
  return params;
}

/** 查询条件 + 页码 → 检索请求体；实体与跳数仅在对应方式下发送。 */
export function toSearchRequest(state: RetrievalQueryState, page = 1): SearchRequest {
  const usesEntities = state.mode === 'graph' || state.mode === 'hybrid';
  return {
    query: state.query,
    mode: state.mode,
    datasetIds: state.datasetIds,
    sort: state.sort,
    from: state.from ?? undefined,
    to: state.to ?? undefined,
    page,
    pageSize: state.pageSize,
    ...(usesEntities && state.entityNames.length ? { entityNames: state.entityNames } : {}),
    ...(state.mode === 'graph' ? { maxHops: state.maxHops } : {}),
  };
}

/* ===== 高级选项：时间范围 ===== */

export const TIME_RANGE_OPTIONS = [
  { value: 'all', label: '不限' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '1y', label: '近 1 年' },
] as const;

export type TimeRange = (typeof TIME_RANGE_OPTIONS)[number]['value'];

const TIME_RANGE_DAYS: Record<Exclude<TimeRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '1y': 365,
};

/** 预设时间范围 → `from`/`to`（开放上界，仅约束起始时间）。 */
export function timeRangeBounds(range: TimeRange, now = new Date()): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };
  return { from: new Date(now.getTime() - TIME_RANGE_DAYS[range] * 86_400_000).toISOString(), to: null };
}

/** 由 `from`/`to` 反推最接近的预设用于回显；无匹配返回 null（自定义）。 */
export function matchTimeRange(from: string | null, to: string | null, now = new Date()): TimeRange | null {
  if (!from && !to) return 'all';
  if (!from || to) return null;
  const elapsed = now.getTime() - Date.parse(from);
  for (const range of TIME_RANGE_OPTIONS) {
    if (range.value === 'all') continue;
    const expected = TIME_RANGE_DAYS[range.value] * 86_400_000;
    if (Math.abs(elapsed - expected) <= 86_400_000) return range.value;
  }
  return null;
}

/** 检索历史条目 → 查询条件，用于「一键回填并重新检索」。 */
export function stateFromHistoryEntry(entry: SearchHistoryEntry): RetrievalQueryState {
  return {
    mode: entry.mode,
    query: entry.query,
    datasetIds: entry.datasetIds,
    sort: entry.filters.sort,
    from: entry.filters.from,
    to: entry.filters.to,
    pageSize: entry.filters.pageSize,
    entityNames: entry.entityNames,
    maxHops: entry.filters.maxHops,
  };
}
