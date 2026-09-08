import {
  ingestionStatusLabel,
  isRetryableIngestionStatus,
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
  expectEqual(ingestionStatusLabel(null), '等待解析');
});
