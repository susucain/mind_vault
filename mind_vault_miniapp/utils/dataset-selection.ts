interface DatasetOption {
  id: string;
}

export function selectAvailableDatasetId(
  selectedDatasetId: string,
  datasets: DatasetOption[],
): string {
  if (datasets.some((dataset) => dataset.id === selectedDatasetId)) {
    return selectedDatasetId;
  }
  return datasets[0]?.id ?? '';
}
