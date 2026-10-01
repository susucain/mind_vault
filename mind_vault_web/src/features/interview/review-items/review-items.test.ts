import { describe, expect, it } from 'vitest';
import type { ReviewItemRecord } from '../../../api/interview';
import { filterReviewItems } from './review-items';

describe('filterReviewItems', () => {
  const items: ReviewItemRecord[] = [
    {
      id: '1',
      sourceTurnId: 'turn-1',
      title: '缓存一致性',
      status: 'PENDING',
      reason: '缺少边界',
      createdAt: '2026-09-30T08:00:00Z',
      updatedAt: '2026-09-30T08:00:00Z',
    },
    {
      id: '2',
      sourceTurnId: 'turn-2',
      title: '限流算法',
      status: 'COMPLETED',
      reason: null,
      createdAt: '2026-09-29T08:00:00Z',
      updatedAt: '2026-09-29T08:00:00Z',
    },
  ];

  it('filters by status and search text', () => {
    expect(filterReviewItems(items, { status: 'PENDING', search: '缓存' })).toHaveLength(1);
    expect(filterReviewItems(items, { status: 'ALL', search: '' })).toHaveLength(2);
  });
});
