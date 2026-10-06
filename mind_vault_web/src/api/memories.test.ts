import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearMemories,
  deleteMemory,
  getMemoryStats,
  listMemories,
  updateMemory,
} from './memories';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestedUrl(fetchMock: { mock: { calls: unknown[][] } }, index = 0): string {
  return String(fetchMock.mock.calls[index][0]);
}

describe('memories api', () => {
  afterEach(() => vi.restoreAllMocks());

  it('omits pagination entirely when no query is given (小程序依赖全量返回)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, pageSize: null }));

    await expect(listMemories()).resolves.toEqual({ items: [], total: 0, page: 1, pageSize: null });

    expect(requestedUrl(fetchMock)).toMatch(/\/memories$/);
  });

  it('serializes filters, keyword and pagination', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ items: [], total: 0, page: 2, pageSize: 50 }));

    await listMemories({ status: 'ACTIVE', kind: 'goal', q: '缓存 策略', page: 2, pageSize: 50 });

    const url = requestedUrl(fetchMock);
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('status')).toBe('ACTIVE');
    expect(params.get('kind')).toBe('goal');
    expect(params.get('q')).toBe('缓存 策略');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('50');
  });

  it('drops blank keyword and undefined filters so the backend sees them as omitted', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, pageSize: null }));

    await listMemories({ q: '', kind: undefined });

    expect(requestedUrl(fetchMock)).toMatch(/\/memories$/);
  });

  it('reads the aggregate counters from /memories/stats', async () => {
    const stats = {
      active: 3,
      superseded: 1,
      total: 4,
      byKind: { preference: 1, fact: 1, goal: 1 },
      hitTotal: 9,
      maxActive: 200,
      atCapacity: false,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(stats));

    await expect(getMemoryStats()).resolves.toEqual(stats);
    expect(requestedUrl(fetchMock)).toContain('/memories/stats');
  });

  it('patches a single memory status', async () => {
    const memory = {
      id: 'm1',
      content: '偏好中文回答',
      kind: 'preference',
      status: 'ACTIVE',
      hitCount: 2,
      lastUsedAt: null,
      sourceConversationId: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(memory));

    await expect(updateMemory('m1', { status: 'ACTIVE' })).resolves.toEqual(memory);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/memories/m1');
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ status: 'ACTIVE' }));
  });

  it('deletes one memory and clears all memories through distinct endpoints', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'm1', deleted: true }))
      .mockResolvedValueOnce(jsonResponse({ deleted: 12 }));

    await expect(deleteMemory('m1')).resolves.toEqual({ id: 'm1', deleted: true });
    await expect(clearMemories()).resolves.toEqual({ deleted: 12 });

    expect(requestedUrl(fetchMock, 0)).toContain('/memories/m1');
    expect(requestedUrl(fetchMock, 1)).toMatch(/\/memories$/);
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE');
  });
});