import { NotFoundException } from '@nestjs/common';
import { SearchHistoryService } from './search-history.service';
import { SearchHistoryRecordInput } from './search-history.types';

const filters = {
  sort: 'relevance' as const,
  from: null,
  to: null,
  pageSize: 10,
  maxHops: 1,
};

const input = (
  overrides: Partial<SearchHistoryRecordInput> = {},
): SearchHistoryRecordInput => ({
  ownerId: 'user_1',
  mode: 'keyword',
  query: '消息队列',
  datasetIds: ['d1'],
  entityNames: [],
  filters,
  resultCount: 3,
  ...overrides,
});

const build = (repository: object) =>
  new SearchHistoryService(repository as never);

describe('SearchHistoryService', () => {
  it('upserts by dedupe key and trims to the newest fifty entries', async () => {
    const repository = { query: jest.fn().mockResolvedValue(undefined) };
    const service = build(repository);

    await service.record(input());

    expect(repository.query).toHaveBeenCalledTimes(2);
    const calls = repository.query.mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const [insertSql, insertParams] = calls[0];
    expect(insertSql).toContain('ON CONFLICT (owner_id, dedupe_key)');
    expect(insertParams.slice(1)).toEqual([
      'user_1',
      'keyword',
      '消息队列',
      JSON.stringify(['d1']),
      JSON.stringify([]),
      JSON.stringify(filters),
      3,
      expect.any(String),
    ]);

    const [trimSql, trimParams] = calls[1];
    expect(trimSql).toContain('DELETE FROM kh_search_history');
    expect(trimParams).toEqual(['user_1', 50]);
  });

  it('derives a stable dedupe key independent of dataset order', async () => {
    const repository = { query: jest.fn().mockResolvedValue(undefined) };
    const service = build(repository);

    await service.record(input({ datasetIds: ['d1', 'd2'] }));
    await service.record(input({ datasetIds: ['d2', 'd1'] }));

    const calls = repository.query.mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(calls[0][1][8]).toBe(calls[2][1][8]);
  });

  it('swallows write failures so retrieval is never blocked', async () => {
    const repository = {
      query: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const service = build(repository);

    await expect(service.record(input())).resolves.toBeUndefined();
  });

  it('rejects deleting a record owned by another user', async () => {
    const repository = {
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const service = build(repository);

    await expect(service.remove('user_2', 'entry_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.delete).toHaveBeenCalledWith({
      id: 'entry_1',
      ownerId: 'user_2',
    });
  });

  it('lists only the current user history and serializes timestamps', async () => {
    const createdAt = new Date('2026-10-05T00:00:00.000Z');
    const repository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'entry_1',
          mode: 'vector',
          query: '一致性',
          datasetIds: null,
          entityNames: ['Kafka'],
          filters,
          resultCount: 4,
          createdAt,
        },
      ]),
    };
    const service = build(repository);

    const items = await service.list('user_1', 20);

    expect(repository.find).toHaveBeenCalledWith({
      where: { ownerId: 'user_1' },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    expect(items).toEqual([
      {
        id: 'entry_1',
        mode: 'vector',
        query: '一致性',
        datasetIds: [],
        entityNames: ['Kafka'],
        filters,
        resultCount: 4,
        createdAt: '2026-10-05T00:00:00.000Z',
      },
    ]);
  });

  it('clears every record for the current user only', async () => {
    const repository = {
      delete: jest.fn().mockResolvedValue({ affected: 3 }),
    };
    const service = build(repository);

    await expect(service.clear('user_1')).resolves.toEqual({ deleted: 3 });
    expect(repository.delete).toHaveBeenCalledWith({ ownerId: 'user_1' });
  });
});
