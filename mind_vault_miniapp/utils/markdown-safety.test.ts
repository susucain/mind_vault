import { sanitizeMarkdown } from './markdown-safety';

const test = (name: string, callback: () => void) => {
  callback();
};

const expectEqual = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
};

test('keeps safe links and images', () => {
  expectEqual(
    sanitizeMarkdown(
      '[docs](https://example.com) ![image](https://example.com/a.png)'
    ),
    '[docs](https://example.com) ![image](https://example.com/a.png)'
  );
});

test('downgrades unsafe links and images to visible text', () => {
  expectEqual(
    sanitizeMarkdown(
      '[bad](javascript:alert(1)) ![bad image](data:text/html,evil)'
    ),
    'bad bad image'
  );
});
