import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CitationCard } from './CitationCard';

describe('CitationCard', () => {
  it('links to a document preview with the exact locator', () => {
    render(<MemoryRouter><CitationCard citation={{ id: 'c1', documentId: 'd1', documentName: '设计文档', excerpt: '引用片段', locator: { page: 4, lineStart: 10 } }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /打开.*设计文档/ })).toHaveAttribute('href', '/app/library/documents/d1/preview?page=4&lineStart=10');
  });
});
