import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocumentOutline, getDocumentSections } from '../../api/documents';
import type { DocumentSectionPageParam } from '../../api/documents';
import type { DocumentSection } from '../../types/domain';
import { DocumentPreviewPage } from './DocumentPreviewPage';

vi.mock('../../api/documents', () => ({
  getDocumentOutline: vi.fn(),
  getDocumentSections: vi.fn(),
}));

const outlineFixture = {
  documentId: 'doc-1',
  title: 'Parsed fixture',
  pageCount: 2,
  totalSections: 2,
  sections: [
    { sectionId: 'intro', heading: '简介', order: 0, locator: { page: 1 } },
    { sectionId: 'target', heading: '目标章节', order: 1, locator: { page: 2, lineStart: 8, lineEnd: 12 } },
  ],
};

const bodyFixture: DocumentSection[] = [
  { sectionId: 'intro', heading: '简介', content: '第一页内容', order: 0, locator: { page: 1 } },
  { sectionId: 'target', heading: '目标章节', content: '需要高亮的真实 text', order: 1, locator: { page: 2, lineStart: 8, lineEnd: 12 } },
];

/** 与后端一致的切片语义：游标是「已取到的最后一个 order」，从 `cursor + 1` 起取。 */
function sliceBodies(bodies: DocumentSection[], param: DocumentSectionPageParam = {}) {
  const limit = param.limit ?? 10;
  const start = param.cursor === undefined ? 0 : param.cursor + 1;
  return { items: bodies.slice(start, start + limit), nextCursor: null, total: bodies.length };
}

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
  beforeEach(() => {
    vi.mocked(getDocumentOutline).mockResolvedValue(outlineFixture);
    vi.mocked(getDocumentSections).mockImplementation((_id, param = {}) =>
      Promise.resolve(sliceBodies(bodyFixture, param)));
  });

  it('selects and highlights a section from locator query parameters', async () => {
    renderRoute('/app/library/documents/doc-1/preview?page=2&lineStart=8&lineEnd=12');

    const section = (await screen.findByRole('heading', { name: '目标章节' })).closest('section');
    expect(section).toHaveAttribute('data-target', 'true');
    expect(section).toHaveTextContent('需要高亮的真实 text');
  });

  it('starts the first body page at the outline order of the deep link target', async () => {
    renderRoute('/app/library/documents/doc-1/preview?page=2&lineStart=8&lineEnd=12');

    await screen.findByRole('heading', { name: '目标章节' });

    expect(getDocumentSections).toHaveBeenCalledWith('doc-1', { cursor: 0, limit: 10 });
  });

  it('selects a section by hash section id', async () => {
    renderRoute('/app/library/documents/doc-1/preview#target');

    const section = (await screen.findByRole('heading', { name: '目标章节' })).closest('section');
    expect(section).toHaveAttribute('data-target', 'true');
  });

  it('links the outline to the rendered section id', async () => {
    renderRoute('/app/library/documents/doc-1/preview');

    await screen.findByRole('heading', { name: '目标章节' });

    expect(screen.getByRole('link', { name: '目标章节' })).toHaveAttribute('href', '#section-1');
    expect(document.getElementById('section-1')).toHaveTextContent('需要高亮的真实 text');
  });

  it('loads the page holding an outline section that is not rendered yet', async () => {
    const many: DocumentSection[] = Array.from({ length: 12 }, (_, index) => ({
      sectionId: `s-${index}`,
      heading: `章节 ${index}`,
      content: `正文 ${index}`,
      order: index,
      locator: {},
    }));
    vi.mocked(getDocumentOutline).mockResolvedValue({
      documentId: 'doc-1',
      title: 'Long fixture',
      pageCount: 12,
      totalSections: many.length,
      sections: many.map(({ sectionId, heading, order, locator }) => ({ sectionId, heading, order, locator })),
    });
    vi.mocked(getDocumentSections).mockImplementation((_id, param = {}) =>
      Promise.resolve(sliceBodies(many, param)));

    renderRoute('/app/library/documents/doc-1/preview');
    await screen.findByRole('heading', { name: '章节 0' });

    fireEvent.click(screen.getByRole('link', { name: '章节 11' }));

    const section = (await screen.findByRole('heading', { name: '章节 11' })).closest('section');
    expect(section).toHaveAttribute('data-target', 'true');
    expect(getDocumentSections).toHaveBeenCalledWith('doc-1', { cursor: 10, limit: 10 });
  });
});
