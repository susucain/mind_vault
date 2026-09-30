import type { ReviewItemRecord } from '../../../api/interview';

export type ReviewFilter = 'ALL' | 'PENDING' | 'COMPLETED';

export function filterReviewItems(
  items: ReviewItemRecord[],
  filter: { status: ReviewFilter; search: string },
): ReviewItemRecord[] {
  const search = filter.search.trim().toLowerCase();
  return items.filter((item) => {
    const statusMatch = filter.status === 'ALL' || item.status === filter.status;
    const text = `${item.title ?? ''} ${item.reason ?? ''}`.toLowerCase();
    return statusMatch && (!search || text.includes(search));
  });
}
