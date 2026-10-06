import { Streamdown, type Components } from 'streamdown';

/**
 * 流式 Markdown 渲染：Streamdown 按块记忆化并修复未闭合语法，
 * isAnimating 为 true 时把最后一块标记为「生成中」，边流边渲染不抖动。
 *
 * `components` 用于按场景覆盖元素渲染（如原文预览的图片与标题降级）。
 * `mode` 传 `static` 可关闭「未闭合语法补全」，用于渲染已落库的静态正文。
 */
export function MarkdownViewer({
  content,
  isAnimating = false,
  components,
  mode = 'streaming',
}: {
  content: string;
  isAnimating?: boolean;
  components?: Components;
  mode?: 'streaming' | 'static';
}) {
  return (
    <div className="markdown-viewer">
      <Streamdown components={components} isAnimating={isAnimating} mode={mode}>
        {content || '正在生成回答…'}
      </Streamdown>
    </div>
  );
}
