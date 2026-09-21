import { formatMemoryTime, memoryKindLabel } from './memory';

const test = (name: string, callback: () => void) => {
  callback();
};

const expectEqual = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
};

test('labels memory kinds in plain language', () => {
  expectEqual(memoryKindLabel('preference'), '偏好');
  expectEqual(memoryKindLabel('fact'), '关于我');
  expectEqual(memoryKindLabel('goal'), '目标');
});

test('formats the last used time relative to now', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  expectEqual(formatMemoryTime(null, now), '还没被用到过');
  expectEqual(formatMemoryTime('2026-09-20T11:59:40Z', now), '刚刚用过');
  expectEqual(formatMemoryTime('2026-09-20T11:30:00Z', now), '30 分钟前用过');
  expectEqual(formatMemoryTime('2026-09-20T08:00:00Z', now), '4 小时前用过');
  expectEqual(formatMemoryTime('2026-09-17T12:00:00Z', now), '3 天前用过');
  expectEqual(formatMemoryTime('2026-07-01T12:00:00Z', now), '2026-07-01 用过');
});

test('falls back when the timestamp cannot be parsed', () => {
  expectEqual(formatMemoryTime('not-a-date'), '还没被用到过');
});
