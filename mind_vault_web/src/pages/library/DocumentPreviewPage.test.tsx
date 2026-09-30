import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocument } from '../../api/documents';
import { DocumentPreviewPage } from './DocumentPreviewPage';

vi.mock('../../api/documents', () => ({ getDocument: vi.fn() }));

const parsedDocumentFixture = {
  id: 'doc-1',
  title: 'Parsed fixture',
  status: 1,
  sections: [
    { sectionId: 'intro', heading: '简介', content: '第一页内容', order: 0, locator: { page: 1 } },
    { sectionId: 'target', heading: '目标章节', content: '需要高亮的真实 text', order: 1, locator: { page: 2, lineStart: 8, lineEnd: 12 } },
  ],
};

function renderRoute(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path="/app/library/documents/:documentId/preview" element={<DocumentPreviewPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DocumentPreviewPage locators', () => {
  beforeEach(() => vi.mocked(getDocument).mockResolvedValue(parsedDocumentFixture));

  it('selects and highlights a section from locator query parameters', async () => {
    renderRoute('/app/library/documents/doc-1/preview?page=2&lineStart=8&lineEnd=12');

    const section = (await screen.findByRole('heading', { name: '目标章节' })).closest('section');
    expect(section).toHaveAttribute('data-target', 'true');
    expect(section).toHaveTextContent('需要高亮的真实 text');
  });

  it('selects a section by hash section id', async () => {
    renderRoute('/app/library/documents/doc-1/preview#target');

    const section = (await screen.findByRole('heading', { name: '目标章节' })).closest('section');
    expect(section).toHaveAttribute('data-target', 'true');
  });

  it('links the outline to the rendered section id', async () => {
    renderRoute('/app/library/documents/doc-1/preview');

    await screen.findByRole('heading', { name: '目标章节' });

    expect(screen.getByRole('link', { name: '目标章节' })).toHaveAttribute('href', '#target');
    expect(document.getElementById('target')).toHaveTextContent('需要高亮的真实 text');
  });
});
