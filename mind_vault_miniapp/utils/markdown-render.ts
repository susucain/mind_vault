import { marked } from 'marked';

export function markdownToHtml(markdown: string) {
  const withoutRawHtml = markdown.replace(/<[^>]*>/g, '');
  return marked(withoutRawHtml, { async: false });
}
