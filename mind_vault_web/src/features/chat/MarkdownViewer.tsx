import { Streamdown } from 'streamdown';

/**
 * 流式 Markdown 渲染：Streamdown 按块记忆化并修复未闭合语法，
 * isAnimating 为 true 时把最后一块标记为「生成中」，边流边渲染不抖动。
 */
export function MarkdownViewer({ content, isAnimating = false }: { content: string; isAnimating?: boolean }) {
  return (
    <div className="markdown-viewer">
      <Streamdown isAnimating={isAnimating}>{content || '正在生成回答…'}</Streamdown>
    </div>
  );
}
