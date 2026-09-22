import { markdownToHtml } from './markdown-render';

const test = (name: string, callback: () => void) => {
  callback();
};

const expectEqual = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
};

test('converts Markdown into HTML for mp-html', () => {
  expectEqual(
    markdownToHtml('# Title\n\n**bold**').trim(),
    '<h1>Title</h1>\n<p><strong>bold</strong></p>'
  );
});

test('removes raw HTML before rendering', () => {
  expectEqual(
    markdownToHtml('before <script>alert(1)</script> after').trim(),
    '<p>before alert(1) after</p>'
  );
});
