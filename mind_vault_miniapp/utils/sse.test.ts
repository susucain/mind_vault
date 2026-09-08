import { parseEvent } from './sse';

const test = (name: string, callback: () => void) => {
  callback();
};

const expectEqual = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
};

test('parses a meta SSE event', () => {
  expectEqual(
    parseEvent(
      'event: meta\ndata: {"messageId":"m1","usedTools":["vector"],"thinking":false}'
    ),
    {
      event: 'meta',
      data: {
        messageId: 'm1',
        usedTools: ['vector'],
        thinking: false,
      },
    }
  );
});

test('returns null for malformed JSON', () => {
  expectEqual(parseEvent('event: token\ndata: {invalid}'), null);
});
