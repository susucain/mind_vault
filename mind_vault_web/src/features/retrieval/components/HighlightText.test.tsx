import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HighlightText } from './HighlightText';

describe('HighlightText', () => {
  it('falls back to plain text when there is no highlight', () => {
    render(<HighlightText fallback="未命中高亮的原文" segments={null} />);
    expect(screen.getByText('未命中高亮的原文')).toBeInTheDocument();
    expect(document.querySelector('mark')).toBeNull();
  });

  it('wraps only hit segments in <mark> without html injection', () => {
    render(
      <HighlightText
        fallback="ignored"
        segments={[
          { text: '这里讲的是', hit: false },
          { text: '<img src=x onerror=alert(1)>', hit: true },
          { text: '的召回策略', hit: false },
        ]}
      />,
    );

    const mark = document.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('<img src=x onerror=alert(1)>');
    // 原样作为文本节点渲染，不会被解析成元素
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('这里讲的是')).toBeInTheDocument();
    expect(screen.getByText('的召回策略')).toBeInTheDocument();
  });
});
