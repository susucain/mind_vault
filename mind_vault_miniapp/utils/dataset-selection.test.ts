import { selectAvailableDatasetId } from './dataset-selection';

const test = (name: string, callback: () => void) => {
  callback();
};

const expectEqual = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
};

test('keeps the selected dataset when it remains available', () => {
  expectEqual(
    selectAvailableDatasetId(
      'dataset_2',
      [{ id: 'dataset_1' }, { id: 'dataset_2' }],
    ),
    'dataset_2',
  );
});

test('falls back when the selected dataset no longer exists', () => {
  expectEqual(
    selectAvailableDatasetId(
      'stale_dataset',
      [{ id: 'dataset_1' }, { id: 'dataset_2' }],
    ),
    'dataset_1',
  );
});

test('returns an empty selection when no datasets are available', () => {
  expectEqual(selectAvailableDatasetId('stale_dataset', []), '');
});
