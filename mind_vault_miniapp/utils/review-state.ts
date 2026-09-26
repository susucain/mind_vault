export function appendReviewPage<T extends { id: string }>(
  current: T[],
  next: T[]
): T[] {
  const seen = new Set(current.map((item) => item.id));
  const appended = next.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return [...current, ...appended];
}

export function hasMoreReviewItems(displayed: number, total: number) {
  return displayed < total;
}

export function reviewScoreLabel(score: number | null | undefined) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return '未评分';
  }
  return `${Math.round(score)} 分`;
}
