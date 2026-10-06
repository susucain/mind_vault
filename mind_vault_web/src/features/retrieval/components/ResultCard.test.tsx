import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '@/types/domain';
import { ResultCard } from './ResultCard';

function makeItem(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    chunkId: 'c1',
    documentId: 'doc-1',
    documentTitle: '产品架构说明',
    datasetIds: ['d1'],
    datasetNames: ['技术资料'],
    text: '这里讲的是向量检索的召回策略',
    highlight: [
      { text: '这里讲的是', hit: false },
      { text: '向量检索', hit: true },
      { text: '的召回策略', hit: false },
    ],
    parentContext: '',
    locator: { page: 3, lineStart: 12, lineEnd: 18 },
    titlePath: ['第三章', '检索设计'],
    score: 0.92,
    scoreKind: 'normalized_bm25',
    sources: ['keyword', 'vector'],
    ...overrides,
  };
}

function renderCard(item: SearchResultItem) {
  return render(
    <MemoryRouter>
      <ResultCard item={item} />
    </MemoryRouter>,
  );
}

describe('ResultCard', () => {
  it('renders title, highlight, sources, locator and a preview link', () => {
    renderCard(makeItem());

    expect(screen.getByText('产品架构说明')).toBeInTheDocument();
    expect(screen.getByText('第三章 / 检索设计')).toBeInTheDocument();
    expect(screen.getByText('0.92')).toBeInTheDocument();
    expect(document.querySelector('mark')?.textContent).toBe('向量检索');
    expect(screen.getByText('关键字')).toBeInTheDocument();
    expect(screen.getByText('语义')).toBeInTheDocument();
    expect(screen.getByText('技术资料')).toBeInTheDocument();
    expect(screen.getByText('第 3 页')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /查看原文/ });
    expect(link).toHaveAttribute(
      'href',
      '/app/library/documents/doc-1/preview?page=3&lineStart=12&lineEnd=18',
    );
  });

  it('shows an association count instead of a score for graph results', () => {
    renderCard(makeItem({ scoreKind: 'graph_degree', score: 4, sources: ['graph'] }));

    expect(screen.getByText('关联 4 条')).toBeInTheDocument();
    expect(screen.queryByText('4')).toBeNull();
  });
});
