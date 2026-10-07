import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CitationCard } from './CitationCard';

describe('CitationCard', () => {
  it('links to a document preview with the exact locator', () => {
    render(<MemoryRouter><CitationCard citation={{ id: 'c1', documentId: 'd1', documentName: '设计文档', chunkId: 'chunk-1', excerpt: '引用片段', locator: { page: 4, lineStart: 10 } }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /打开.*设计文档/ })).toHaveAttribute('href', '/app/library/documents/d1/preview?page=4&lineStart=10');
  });

  it('shows a neutral placeholder instead of the raw document id when the name is missing', () => {
    render(<MemoryRouter><CitationCard citation={{ id: 'c1', documentId: '1788971399589003', documentName: '', chunkId: 'chunk-1', excerpt: '引用片段', locator: {} }} /></MemoryRouter>);
    expect(screen.getByText('未知文档')).toBeInTheDocument();
    expect(screen.queryByText('1788971399589003')).not.toBeInTheDocument();
  });

  it('renders hit segments as mark and keeps the rest as plain text', () => {
    render(<MemoryRouter><CitationCard citation={{ id: 'c1', documentId: 'd1', documentName: '设计文档', chunkId: 'chunk-1', excerpt: '引用片段', locator: {}, highlight: [{ text: '引用', hit: false }, { text: '片段', hit: true }] }} /></MemoryRouter>);
    // 命中词用 mark 语义元素，不走 innerHTML
    expect(screen.getByText('片段').tagName).toBe('MARK');
    expect(screen.getByText('引用').tagName).toBe('SPAN');
  });

  it('falls back to the raw excerpt when the citation has no highlight segments', () => {
    // 语义检索路径与存量数据都没有分段，此时按原文整段渲染，不报错也不空白
    render(<MemoryRouter><CitationCard citation={{ id: 'c1', documentId: 'd1', documentName: '设计文档', chunkId: 'chunk-1', excerpt: '没有高亮的原文', locator: {} }} /></MemoryRouter>);
    expect(screen.getByText('没有高亮的原文')).toBeInTheDocument();
  });
});
