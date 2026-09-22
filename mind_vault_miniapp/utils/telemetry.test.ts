import { summarizeStreamUsage } from './telemetry';
import { RequestTrace } from '../types/telemetry';

const test = (name: string, callback: () => void) => {
  callback();
};

const expectEqual = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
};

const trace = (input: Partial<RequestTrace>): RequestTrace => ({
  timestamp: 1,
  method: 'POST',
  path: '/conversations/conversation_1/messages/stream',
  durationMs: 10,
  ...input,
});

test('counts memory injection and general fallback among stream traces', () => {
  const summary = summarizeStreamUsage([
    trace({ usedTools: ['vector', 'memory'], answerMode: 'rag' }),
    trace({ usedTools: ['vector'], answerMode: 'rag' }),
    trace({ usedTools: ['vector', 'memory'], answerMode: 'general' }),
  ]);

  expectEqual(summary.total, 3);
  expectEqual(summary.memoryInjected, 2);
  expectEqual(summary.generalAnswers, 1);
});

test('ignores traces that carry no meta or are not stream messages', () => {
  const summary = summarizeStreamUsage([
    trace({ statusCode: 200 }),
    trace({ path: '/conversations/conversation_1/messages' }),
    trace({ usedTools: [], answerMode: 'rag' }),
  ]);

  expectEqual(summary.total, 2);
  expectEqual(summary.memoryInjected, 0);
  expectEqual(summary.generalAnswers, 0);
});

test('returns zeros when there is nothing recorded', () => {
  const summary = summarizeStreamUsage([]);

  expectEqual(summary.total, 0);
  expectEqual(summary.memoryInjected, 0);
  expectEqual(summary.generalAnswers, 0);
});

test('summarizes completed, aborted, and failed stream outcomes', () => {
  const summary = summarizeStreamUsage([
    trace({ usedTools: [], finishReason: 'completed', durationMs: 100 }),
    trace({ usedTools: [], finishReason: 'aborted', durationMs: 200 }),
    trace({ usedTools: [], finishReason: 'failed', durationMs: 300 }),
  ]);

  expectEqual(summary.completed, 1);
  expectEqual(summary.aborted, 1);
  expectEqual(summary.failed, 1);
  expectEqual(summary.averageDurationMs, 200);
});
