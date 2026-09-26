import { Dataset } from '../types/api';

export function normalizeDatasetScope(selectedIds: string[], allIds: string[]) {
  const validIds = new Set(allIds);
  const source = selectedIds.length ? selectedIds : allIds;
  return [...new Set(source)].filter((id) => validIds.has(id));
}

export function sanitizeDatasetScope(selectedIds: string[], allIds: string[]) {
  const validIds = new Set(allIds);
  return [...new Set(selectedIds)].filter((id) => validIds.has(id));
}

export function isAllDatasetScope(selectedIds: string[], allIds: string[]) {
  if (!allIds.length || selectedIds.length !== allIds.length) return false;
  const selected = new Set(selectedIds);
  return allIds.every((id) => selected.has(id));
}

export function toggleAllDatasetScope(selectedIds: string[], allIds: string[]) {
  return isAllDatasetScope(selectedIds, allIds) ? [] : [...allIds];
}

export function toggleDatasetScope(selectedIds: string[], id: string) {
  return selectedIds.includes(id)
    ? selectedIds.filter((item) => item !== id)
    : [...selectedIds, id];
}

export function datasetScopeSummary(
  selectedIds: string[],
  datasets: Array<Pick<Dataset, 'id' | 'name'>>
) {
  if (!selectedIds.length) return '还没有资料';
  if (
    isAllDatasetScope(
      selectedIds,
      datasets.map((dataset) => dataset.id)
    )
  ) {
    return '全部资料';
  }
  if (selectedIds.length === 1) {
    return (
      datasets.find((dataset) => dataset.id === selectedIds[0])?.name ??
      '已选 1 个资料集'
    );
  }
  return `已选 ${selectedIds.length} 个资料集`;
}
