import { filterSessions, mergeSessionItems } from './sessions';

const test = (_name: string, callback: () => void) => callback();
const expectEqual = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
};

const datasets = [
  { id: 'dataset_1', name: '我的项目', createdAt: '2026-09-21' },
];

test('merges chat and interview sessions by latest activity', () => {
  const items = mergeSessionItems(
    [
      {
        id: 'chat_1',
        title: '后端复盘',
        datasetIds: ['dataset_1'],
        createdAt: '2026-09-21',
        updatedAt: '2026-09-21T10:00:00Z',
      },
    ],
    [
      {
        id: 'interview_1',
        datasetId: 'dataset_1',
        mode: 'technical',
        status: 'IN_PROGRESS',
        currentIndex: 1,
        totalQuestions: 5,
        createdAt: '2026-09-21',
        updatedAt: '2026-09-22T10:00:00Z',
      },
    ],
    datasets
  );

  expectEqual(
    items.map((item) => item.kind),
    ['interview', 'chat']
  );
  expectEqual(items[0].subtitle, '我的项目');
});

test('filters unified sessions by kind', () => {
  const items = [
    { id: 'chat_1', kind: 'chat' as const },
    { id: 'interview_1', kind: 'interview' as const },
  ] as never[];

  expectEqual(filterSessions(items, 'chat'), [items[0]]);
});
