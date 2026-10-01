import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownViewer({ content }: { content: string }) {
  return <div className="markdown-viewer"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '正在生成回答…'}</ReactMarkdown></div>;
}
