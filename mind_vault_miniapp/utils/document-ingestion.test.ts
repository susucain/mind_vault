import {
  buildUploadDisplayState,
  ingestionStatusLabel,
  isRetryableIngestionStatus,
  isTerminalIngestionStatus,
  shouldShowGraphProgress,
  shouldShowMainIngestionProgress,
} from './document-ingestion';

const test = (name: string, callback: () => void) => {
  callback();
};

const expectEqual = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
};

test('allows retrying failed and undelivered ingestion jobs', () => {
  expectEqual(isRetryableIngestionStatus('FAILED'), true);
  expectEqual(isRetryableIngestionStatus('UPLOADED'), true);
  expectEqual(isRetryableIngestionStatus('PARSING'), false);
});

test('labels ingestion states for the document list', () => {
  expectEqual(ingestionStatusLabel('FAILED'), '解析失败');
  expectEqual(ingestionStatusLabel('READY'), '解析完成');
  expectEqual(ingestionStatusLabel('CANCELLED'), '已取消');
  expectEqual(ingestionStatusLabel(null), '等待解析');
});

test('treats failed, ready, and deleted ingestion states as terminal', () => {
  expectEqual(isTerminalIngestionStatus('FAILED'), true);
  expectEqual(isTerminalIngestionStatus('READY'), true);
  expectEqual(isTerminalIngestionStatus('CANCELLED'), true);
  expectEqual(isTerminalIngestionStatus('DELETED'), true);
  expectEqual(isTerminalIngestionStatus('EMBEDDING'), false);
});

test('hides failed main progress while retaining the graph not-started state', () => {
  expectEqual(shouldShowMainIngestionProgress('FAILED'), false);
  expectEqual(shouldShowMainIngestionProgress('EMBEDDING'), true);
  expectEqual(
    shouldShowGraphProgress({
      status: 'NOT_STARTED',
      completed: 0,
      total: 0,
      failed: 0,
      estimatedRemainingSeconds: null,
    }),
    true
  );
});

test('builds failed upload display state with graph zero progress', () => {
  const state = buildUploadDisplayState('FAILED', {
    status: 'NOT_STARTED',
    completed: 0,
    total: 0,
    failed: 0,
    estimatedRemainingSeconds: null,
  });
  expectEqual(state.showMainIngestionProgress, false);
  expectEqual(state.showGraphProgress, true);
});
