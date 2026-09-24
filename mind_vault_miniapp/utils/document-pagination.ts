export function appendDocumentPage<T extends { id: string }>(
  current: T[],
  incoming: T[],
  page: number,
  pageSize: number,
) {
  const items =
    page === 1
      ? incoming
      : [...current, ...incoming.filter((item) => !current.some((old) => old.id === item.id))];
  return {
    items,
    nextPage: page + 1,
    hasMore: incoming.length === pageSize,
  };
}
