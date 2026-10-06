import { describe, expect, it } from 'vitest';
import type { SearchHistoryEntry } from '@/types/domain';
import {
  DEFAULT_MAX_HOPS,
  DEFAULT_MODE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  MAX_QUERY_LENGTH,
  matchTimeRange,
  parseRetrievalParams,
  serializeRetrievalParams,
  stateFromHistoryEntry,
  timeRangeBounds,
  toSearchRequest,
  type RetrievalQueryState,
} from './retrieval-schema';

describe('parseRetrievalParams', () => {
  it('falls back to defaults when params are missing or invalid', () => {
    const state = parseRetrievalParams(
      new URLSearchParams('mode=unknown&sort=weird&pageSize=999&hops=9'),
    );

    expect(state).toEqual({
      mode: DEFAULT_MODE,
      query: '',
      datasetIds: [],
      sort: DEFAULT_SORT,
      from: null,
      to: null,
      pageSize: DEFAULT_PAGE_SIZE,
      entityNames: [],
      maxHops: DEFAULT_MAX_HOPS,
    });
  });

  it('parses comma separated lists with trim, dedupe and cap', () => {
    const entities = Array.from({ length: 15 }, (_, index) => `实体${index}`).join(',');
    const state = parseRetrievalParams(
      new URLSearchParams({ datasets: ' a, b ,a,,c ', entities }),
    );

    expect(state.datasetIds).toEqual(['a', 'b', 'c']);
    expect(state.entityNames).toHaveLength(10);
    expect(state.entityNames[0]).toBe('实体0');
  });

  it('keeps parsable time bounds and drops the unparsable ones', () => {
    const valid = parseRetrievalParams(
      new URLSearchParams({ from: '2026-01-01T00:00:00.000Z', to: '2026-10-05' }),
    );
    expect(valid.from).toBe('2026-01-01T00:00:00.000Z');
    expect(valid.to).toBe('2026-10-05');

    expect(parseRetrievalParams(new URLSearchParams({ from: 'not-a-date' })).from).toBeNull();
  });

  it('truncates an overlong query to the backend limit', () => {
    const state = parseRetrievalParams(new URLSearchParams({ q: ' x'.repeat(150) }));
    expect(state.query).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe('serializeRetrievalParams', () => {
  it('omits default values to keep shared urls short', () => {
    const params = serializeRetrievalParams({
      mode: DEFAULT_MODE,
      query: '  向量检索 ',
      datasetIds: [],
      sort: DEFAULT_SORT,
      from: null,
      to: null,
      pageSize: DEFAULT_PAGE_SIZE,
      entityNames: [],
      maxHops: DEFAULT_MAX_HOPS,
    });

    expect(params.toString()).toBe('q=%E5%90%91%E9%87%8F%E6%A3%80%E7%B4%A2');
  });

  it('writes non-default values in a stable order', () => {
    const params = serializeRetrievalParams({
      mode: 'graph',
      query: 'Kafka',
      datasetIds: ['d1', 'd2'],
      sort: 'recent',
      from: '2026-01-01',
      to: '2026-10-05',
      pageSize: 20,
      entityNames: ['Kafka'],
      maxHops: 3,
    });

    expect(params.toString()).toBe(
      'q=Kafka&mode=graph&datasets=d1%2Cd2&sort=recent&from=2026-01-01&to=2026-10-05&pageSize=20&entities=Kafka&hops=3',
    );
  });

  it('round-trips a full state through parse', () => {
    const state: RetrievalQueryState = {
      mode: 'hybrid',
      query: '召回策略',
      datasetIds: ['d2', 'd1'],
      sort: 'recent',
      from: '2026-01-01T00:00:00.000Z',
      to: null,
      pageSize: 20,
      entityNames: ['Kafka', 'ES'],
      maxHops: 2,
    };

    expect(parseRetrievalParams(serializeRetrievalParams(state))).toEqual(state);
  });
});

describe('toSearchRequest', () => {
  const base: RetrievalQueryState = {
    mode: 'keyword',
    query: '召回策略',
    datasetIds: ['d1'],
    sort: 'relevance',
    from: null,
    to: null,
    pageSize: 10,
    entityNames: ['Kafka'],
    maxHops: 3,
  };

  it('omits entity and hop fields for keyword and vector modes', () => {
    expect(toSearchRequest(base, 2)).toEqual({
      query: '召回策略',
      mode: 'keyword',
      datasetIds: ['d1'],
      sort: 'relevance',
      page: 2,
      pageSize: 10,
    });
  });

  it('sends entity names for graph and hybrid but hops only for graph', () => {
    const graph = toSearchRequest({ ...base, mode: 'graph' });
    expect(graph.entityNames).toEqual(['Kafka']);
    expect(graph.maxHops).toBe(3);

    const hybrid = toSearchRequest({ ...base, mode: 'hybrid' });
    expect(hybrid.entityNames).toEqual(['Kafka']);
    expect(hybrid.maxHops).toBeUndefined();
  });
});

describe('time range helpers', () => {
  const now = new Date('2026-10-05T00:00:00.000Z');

  it('maps a preset to an open-ended lower bound', () => {
    expect(timeRangeBounds('all', now)).toEqual({ from: null, to: null });
    expect(timeRangeBounds('7d', now).from).toBe('2026-09-28T00:00:00.000Z');
  });

  it('infers the matching preset and reports custom ranges', () => {
    expect(matchTimeRange(null, null, now)).toBe('all');
    expect(matchTimeRange('2026-09-28T00:00:00.000Z', null, now)).toBe('7d');
    expect(matchTimeRange('2026-01-01T00:00:00.000Z', null, now)).toBeNull();
  });
});

describe('stateFromHistoryEntry', () => {
  it('restores every query condition from a history record', () => {
    const entry: SearchHistoryEntry = {
      id: 'h1',
      mode: 'graph',
      query: '向量检索',
      datasetIds: ['d1'],
      entityNames: ['向量检索'],
      filters: { sort: 'recent', from: '2026-01-01', to: null, pageSize: 20, maxHops: 3 },
      resultCount: 8,
      createdAt: '2026-10-04T12:00:00.000Z',
    };

    expect(stateFromHistoryEntry(entry)).toEqual({
      mode: 'graph',
      query: '向量检索',
      datasetIds: ['d1'],
      sort: 'recent',
      from: '2026-01-01',
      to: null,
      pageSize: 20,
      entityNames: ['向量检索'],
      maxHops: 3,
    });
  });
});
