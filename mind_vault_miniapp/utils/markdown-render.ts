declare const require: (path: string) => {
  marked: (markdown: string) => string;
};

const { marked } = require('../components/mp-html/markdown/marked.min');

export function markdownToHtml(markdown: string) {
  const withoutRawHtml = markdown.replace(/<[^>]*>/g, '');
  return marked(withoutRawHtml);
}
