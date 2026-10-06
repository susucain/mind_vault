import type { HighlightSegment } from '@/types/domain';

/**
 * 渲染后端返回的高亮分段。分段是纯数据结构，不存在 HTML 注入路径，
 * 因此不使用 `dangerouslySetInnerHTML`（见设计方案 4.7.4）。
 */
export function HighlightText({ segments, fallback }: { segments: HighlightSegment[] | null; fallback: string }) {
  if (!segments || segments.length === 0) {
    return <>{fallback}</>;
  }

  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          <mark className="retrieval-hit" key={index}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
