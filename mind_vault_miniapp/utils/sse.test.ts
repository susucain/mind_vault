import { parseEvent, SseParser } from './sse';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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

test('parses CRLF events', () => {
  expectEqual(parseEvent('event: content\r\ndata: {"text":"a"}\r\n'), {
    event: 'content',
    data: { text: 'a' },
  });
});

test('ignores SSE comments and metadata fields', () => {
  expectEqual(
    parseEvent(': ping\r\nevent: heartbeat\r\nid: 1\r\nretry: 5000\r\n'),
    null
  );
});

test('keeps a UTF-8 character intact when split across chunks', () => {
  const prefix = Array.from('event: token\ndata: {"text":"', (char) =>
    char.charCodeAt(0)
  );
  const suffix = Array.from('"}\n\n', (char) => char.charCodeAt(0));
  const encoded = new Uint8Array([...prefix, 0xe4, 0xbd, 0xa0, ...suffix]);
  const characterStart = prefix.length;
  const chunks = [
    encoded.slice(0, characterStart + 2).buffer,
    encoded.slice(characterStart + 2).buffer,
  ];
  (globalThis as unknown as { wx: unknown }).wx = {
    arrayBufferToBase64(buffer: ArrayBuffer) {
      const values = new Uint8Array(buffer);
      let output = '';
      for (let index = 0; index < values.length; index += 3) {
        const first = values[index];
        const second = values[index + 1];
        const third = values[index + 2];
        output += BASE64_ALPHABET[first >> 2];
        output += BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)];
        output +=
          index + 1 < values.length
            ? BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)]
            : '=';
        output += index + 2 < values.length ? BASE64_ALPHABET[third & 63] : '=';
      }
      return output;
    },
  };
  const parser = new SseParser();
  parser.push(chunks[0]);
  const events = parser.push(chunks[1]);
  expectEqual(events, [{ event: 'token', data: { text: '你' } }]);
});
