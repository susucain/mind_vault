declare const require: (path: string) => {
  marked: (markdown: string, options: { async: false }) => string;
};

const { marked } = require('./marked');

export function markdownToHtml(markdown: string) {
  const withoutRawHtml = markdown.replace(/<[^>]*>/g, '');
  return marked(withoutRawHtml, { async: false });
}
