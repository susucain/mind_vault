import {
  datasetScopeSummary,
  sanitizeDatasetScope,
  isAllDatasetScope,
  normalizeDatasetScope,
  toggleAllDatasetScope,
  toggleDatasetScope,
} from './chat-dataset-scope';

const datasets = [
  { id: 'a', name: '后端面试' },
  { id: 'b', name: '系统设计' },
  { id: 'c', name: 'Java 基础' },
];

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

expectEqual(isAllDatasetScope(['a', 'b'], ['b', 'a']), true, 'recognizes all');
expectEqual(isAllDatasetScope(['a'], ['a', 'b']), false, 'recognizes partial');
expectEqual(
  toggleAllDatasetScope(['a'], ['a', 'b']),
  ['a', 'b'],
  'selects all'
);
expectEqual(toggleAllDatasetScope(['a', 'b'], ['a', 'b']), [], 'clears all');
expectEqual(toggleDatasetScope(['a', 'b'], 'a'), ['b'], 'removes one');
expectEqual(toggleDatasetScope(['b'], 'a'), ['b', 'a'], 'adds one');
expectEqual(
  normalizeDatasetScope([], ['a', 'b']),
  ['a', 'b'],
  'normalizes old empty scope'
);
expectEqual(sanitizeDatasetScope([], ['a', 'b']), [], 'keeps an empty draft');
expectEqual(
  normalizeDatasetScope(['b', 'missing', 'b'], ['a', 'b']),
  ['b'],
  'normalizes invalid ids'
);
expectEqual(datasetScopeSummary(['a'], datasets), '后端面试', 'summarizes one');
expectEqual(
  datasetScopeSummary(['a', 'b'], datasets),
  '已选 2 个资料集',
  'summarizes many'
);
expectEqual(
  datasetScopeSummary(['a', 'b', 'c'], datasets),
  '全部资料',
  'summarizes all'
);

console.log('chat dataset scope tests passed');
