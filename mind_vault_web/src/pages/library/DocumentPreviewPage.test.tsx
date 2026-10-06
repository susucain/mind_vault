import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDocumentAsset, getDocumentOutline, getDocumentSections } from '../../api/documents';
import type { DocumentSectionPageParam } from '../../api/documents';
import type { DocumentSection } from '../../types/domain';
import { DocumentPreviewPage } from './DocumentPreviewPage';

vi.mock('../../api/documents', () => ({
  fetchDocumentAsset: vi.fn(),
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

/** 立即判定为进入视口的 IntersectionObserver 替身，避免依赖真实布局。 */
class ImmediateObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

describe('DocumentPreviewPage markdown body', () => {
  const sections: DocumentSection[] = [
    {
      sectionId: 'page-1',
      heading: '第 1 页',
      content: '# 小节标题\n\n![](pdf-images/p1.png)',
      order: 0,
      locator: { page: 1 },
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:asset'), writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
    vi.mocked(fetchDocumentAsset).mockReset();
    vi.mocked(fetchDocumentAsset).mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    vi.mocked(getDocumentOutline).mockResolvedValue({
      documentId: 'doc-1',
      title: '带插图的文档',
      pageCount: 1,
      totalSections: sections.length,
      sections: sections.map(({ sectionId, heading, order, locator }) => ({ sectionId, heading, order, locator })),
    });
    vi.mocked(getDocumentSections).mockImplementation((_id, param = {}) =>
      Promise.resolve(sliceBodies(sections, param)));
  });

  it('demotes body markdown headings so the document keeps a single h1', async () => {
    renderRoute('/app/library/documents/doc-1/preview');

    expect(await screen.findByRole('heading', { level: 3, name: '小节标题' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders an asset reference as an authenticated image instead of blocked text', async () => {
    renderRoute('/app/library/documents/doc-1/preview');

    await waitFor(() => expect(fetchDocumentAsset).toHaveBeenCalledWith('pdf-images/p1.png'));
    expect(document.querySelector('img.asset-image')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Image blocked');
  });
});

/** 不触发任何加载的观察器替身：让分页停在首页，交互断言可预期。 */
class SilentObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function manySections(count: number): DocumentSection[] {
  return Array.from({ length: count }, (_, index) => ({
    sectionId: `s-${index}`,
    heading: `章节 ${index}`,
    content: `正文 ${index}`,
    order: index,
    locator: {},
  }));
}

/** 只触发顶部反向哨兵的观察器替身：让「加载更早内容」按需发生。 */
class TopSentinelObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const article = target.closest('.preview-content');
    if (!article || article.firstElementChild !== target) return;
    this.callback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

describe('DocumentPreviewPage reading interactions', () => {
  const sections = manySections(12);

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('IntersectionObserver', SilentObserver);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: window.innerHeight + 1000,
    });
    vi.mocked(getDocumentOutline).mockResolvedValue({
      documentId: 'doc-1',
      title: 'Long fixture',
      pageCount: sections.length,
      totalSections: sections.length,
      sections: sections.map(({ sectionId, heading, order, locator }) => ({ sectionId, heading, order, locator })),
    });
    vi.mocked(getDocumentSections).mockImplementation((_id, param = {}) =>
      Promise.resolve(sliceBodies(sections, param)));
  });

  it('highlights the outline entry of the section currently in view', async () => {
    // 章节 0–3 位于观察线之上，章节 4 起在下方 → 当前章节应为章节 3
    const rect = { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0 };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const order = Number(this.id?.replace('section-', ''));
      const top = Number.isFinite(order) ? (order >= 4 ? 4000 : 100) : 0;
      return { ...rect, bottom: top, top } as DOMRect;
    });

    renderRoute('/app/library/documents/doc-1/preview');
    fireEvent.scroll(window);

    expect(await screen.findByRole('link', { name: '章节 3' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('link', { name: '章节 9' })).not.toHaveAttribute('aria-current');
    vi.restoreAllMocks();
  });

  it('filters the outline by keyword and reports an empty result', async () => {
    renderRoute('/app/library/documents/doc-1/preview');
    await screen.findByRole('heading', { name: '章节 0' });

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索章节' }), { target: { value: '章节 1' } });

    expect(screen.getByRole('link', { name: '章节 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '章节 10' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '章节 2' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索章节' }), { target: { value: '不存在的章节' } });
    expect(screen.getByText('没有匹配的章节')).toBeInTheDocument();
  });

  it('collapses a long outline to the current chapter and expands on demand', async () => {
    renderRoute('/app/library/documents/doc-1/preview');
    await screen.findByRole('heading', { name: '章节 0' });

    // 折叠态：仅保留当前章节附近条目
    expect(screen.queryByRole('link', { name: '章节 0' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开全部 12 章' }));

    expect(screen.getByRole('link', { name: '章节 0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收起目录' }));
    expect(screen.queryByRole('link', { name: '章节 0' })).not.toBeInTheDocument();
  });

  it('applies font size and line height and persists the preference', async () => {
    renderRoute('/app/library/documents/doc-1/preview');
    await screen.findByRole('heading', { name: '章节 0' });

    expect(screen.getByRole('button', { name: '字号标准' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '字号特大' }));
    fireEvent.click(screen.getByRole('button', { name: '行距紧凑' }));

    expect(screen.getByRole('button', { name: '字号特大' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '字号标准' })).toHaveAttribute('aria-pressed', 'false');
    const style = document.querySelector('.preview-content')?.getAttribute('style') ?? '';
    expect(style).toContain('--mv-reading-font-size: 1.25rem');
    expect(style).toContain('--mv-reading-line-height: 1.6');
    expect(localStorage.getItem('mind-vault.reading-preferences')).toContain('"fontSize":"xlarge"');
  });

  it('restores the stored reading preference on first render', async () => {
    localStorage.setItem(
      'mind-vault.reading-preferences',
      JSON.stringify({ fontSize: 'large', lineHeight: 'loose' }),
    );

    renderRoute('/app/library/documents/doc-1/preview');
    await screen.findByRole('heading', { name: '章节 0' });

    expect(screen.getByRole('button', { name: '字号大' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '行距宽松' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports reading progress while scrolling', async () => {
    renderRoute('/app/library/documents/doc-1/preview');
    await screen.findByRole('heading', { name: '章节 0' });

    expect(screen.getByRole('progressbar', { name: '阅读进度' })).toHaveAttribute('aria-valuenow', '0');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    fireEvent.scroll(window);

    expect(screen.getByRole('progressbar', { name: '阅读进度' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('jumps to the next chapter and scrolls back to top', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo, writable: true });

    renderRoute('/app/library/documents/doc-1/preview');
    await screen.findByRole('heading', { name: '章节 0' });

    // 首页只加载了 0–9，当前章节为章节 9 → 下一章需要重建分页
    fireEvent.click(screen.getByRole('button', { name: '回到顶部' }));
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 0 });

    fireEvent.click(screen.getByRole('button', { name: '下一章' }));
    await waitFor(() => expect(getDocumentSections).toHaveBeenCalledWith('doc-1', { cursor: 9, limit: 10 }));
  });

  it('keeps the view at the top while earlier pages load back in', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo, writable: true });
    vi.stubGlobal('IntersectionObserver', TopSentinelObserver);
    // 每次读取高度都不同，模拟上插内容确实改变了文档高度
    let reads = 0;
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      get: () => window.innerHeight + 1000 + reads++ * 100,
    });
    const located = manySections(12);
    located[11] = { ...located[11], locator: { page: 12 } };
    vi.mocked(getDocumentOutline).mockResolvedValue({
      documentId: 'doc-1',
      title: 'Long fixture',
      pageCount: located.length,
      totalSections: located.length,
      sections: located.map(({ sectionId, heading, order, locator }) => ({ sectionId, heading, order, locator })),
    });

    // 深链把窗口起点放在章节 11 → 上方仍有更早内容待加载
    renderRoute('/app/library/documents/doc-1/preview?page=12');
    await screen.findByRole('heading', { name: '章节 11' });
    expect(getDocumentSections).toHaveBeenCalledWith('doc-1', { cursor: 10, limit: 10 });

    fireEvent.click(screen.getByRole('button', { name: '回到顶部' }));
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 0 });

    fireEvent.scroll(window);
    await waitFor(() => expect(getDocumentSections).toHaveBeenCalledWith('doc-1', { cursor: 0, limit: 10 }));
    // 等 loadEarlier 的补偿帧跑过，再断言没有发生「推回原处」的滚动
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(scrollTo.mock.calls.map(([arg]) => arg)).toEqual([{ behavior: 'smooth', top: 0 }]);
  });
});
