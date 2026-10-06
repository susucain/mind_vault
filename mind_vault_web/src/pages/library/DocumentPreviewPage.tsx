import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Button, LoadingState } from '../../components/ui';
import { DocumentLocatorView } from '../../features/documents/DocumentLocator';
import { useDocumentOutline, useDocumentSections } from '../../features/documents/use-document';
import type { DocumentLocator, DocumentSection } from '../../types/domain';

const locatorKeys = ['page', 'slide', 'lineStart', 'lineEnd'] as const;

function selectedLocator(search: string, hash: string): { sectionId?: string; locator: DocumentLocator } {
  const hashValue = decodeURIComponent(hash.replace(/^#/, ''));
  const params = new URLSearchParams(search);
  if (hashValue.includes('=')) {
    new URLSearchParams(hashValue).forEach((value, key) => params.set(key, value));
  }
  const locator: DocumentLocator = {
    sheet: params.get('sheet') || undefined,
    cellRange: params.get('cellRange') || undefined,
    jsonPath: params.get('jsonPath') || undefined,
  };
  for (const key of locatorKeys) {
    const value = params.get(key);
    if (value !== null && Number.isFinite(Number(value))) locator[key] = Number(value);
  }
  return {
    sectionId: params.get('sectionId') || (!hashValue.includes('=') ? hashValue || undefined : undefined),
    locator,
  };
}

function isTarget(section: DocumentSection, target: ReturnType<typeof selectedLocator>): boolean {
  if (target.sectionId && section.sectionId === target.sectionId) return true;
  const entries = Object.entries(target.locator).filter(([, value]) => value !== undefined);
  return entries.length > 0 && entries.every(([key, value]) =>
    section.locator[key as keyof DocumentLocator] === value);
}

/** 正文块以 order 作为稳定且唯一的锚点（超长章节切分后 sectionId 会重复）。 */
function sectionDomId(order: number): string {
  return `section-${order}`;
}

export function DocumentPreviewPage() {
  const { documentId } = useParams();
  const location = useLocation();
  const target = useMemo(
    () => selectedLocator(location.search, location.hash),
    [location.search, location.hash],
  );

  const outlineQuery = useDocumentOutline(documentId);
  const outline = outlineQuery.data;
  const outlineSections = useMemo(() => outline?.sections ?? [], [outline]);

  // 深链定位：先用大纲算出目标块的 order，再以它为首个游标直接取该页（无需等待全量）。
  const targetOrder = useMemo(() => {
    const index = outlineSections.findIndex((section) => isTarget(section, target));
    return index >= 0 ? outlineSections[index].order : undefined;
  }, [outlineSections, target]);

  // 目录跳转：目标块尚未加载时，以它的 order 重建分页（复用深链机制）。
  const [jumpOrder, setJumpOrder] = useState<number | undefined>();
  const focusOrder = jumpOrder ?? targetOrder;

  const sectionsQuery = useDocumentSections(documentId, {
    startOrder: focusOrder,
    enabled: outlineQuery.isSuccess,
  });

  const sections = useMemo(() => {
    const seen = new Set<number>();
    const list: DocumentSection[] = [];
    for (const page of sectionsQuery.data?.pages ?? []) {
      for (const item of page.items) {
        const order = item.order;
        if (order === undefined || seen.has(order)) continue;
        seen.add(order);
        list.push(item);
      }
    }
    return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [sectionsQuery.data]);

  const loadedOrders = useMemo(
    () => new Set(sections.map((section) => section.order)),
    [sections],
  );
  const focusDomId = focusOrder === undefined ? undefined : sectionDomId(focusOrder);
  const hasFocus = focusOrder !== undefined && loadedOrders.has(focusOrder);

  useEffect(() => {
    if (!focusDomId || !hasFocus) return;
    document.getElementById(focusDomId)?.scrollIntoView?.({ block: 'center' });
  }, [focusDomId, hasFocus]);

  // 顶部反向哨兵：加载更早内容，并补偿上插引起的滚动位移
  const { fetchPreviousPage, hasPreviousPage, isFetchingPreviousPage } = sectionsQuery;
  const loadEarlier = useCallback(async () => {
    const anchorTop = window.scrollY;
    const anchorHeight = document.documentElement.scrollHeight;
    await fetchPreviousPage();
    requestAnimationFrame(() => {
      const delta = document.documentElement.scrollHeight - anchorHeight;
      if (delta !== 0) window.scrollTo({ top: anchorTop + delta });
    });
  }, [fetchPreviousPage]);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(true);
    window.addEventListener('scroll', onScroll, { once: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = topSentinelRef.current;
    if (!node || !scrolled || !hasPreviousPage || isFetchingPreviousPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadEarlier();
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrolled, hasPreviousPage, isFetchingPreviousPage, loadEarlier]);

  // 底部哨兵：触底加载后续内容
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = sectionsQuery;
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = bottomSentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (outlineQuery.isPending) return <LoadingState label="加载原文" />;
  if (outlineQuery.isError || !outline) {
    return <section className="state-panel state-panel--error"><h2>原文加载失败</h2><Button onClick={() => void outlineQuery.refetch()} variant="secondary">重试</Button></section>;
  }
  if (sectionsQuery.isPending) return <LoadingState label="加载正文" />;
  if (sectionsQuery.isError && !sections.length) {
    return <section className="state-panel state-panel--error"><h2>正文加载失败</h2><Button onClick={() => void sectionsQuery.refetch()} variant="secondary">重试</Button></section>;
  }

  return (
    <section className="document-preview page-section">
      <header className="preview-header">
        <Link aria-label="返回文档详情" className="icon-button" to={`/app/library/documents/${outline.documentId}`}><ArrowLeft size={18} /></Link>
        <div><p className="eyebrow">原文预览</p><h1>{outline.title}</h1></div>
      </header>
      <div className="preview-layout">
        <nav aria-label="章节目录" className="preview-outline">
          <h2>章节</h2>
          {outline.sections.map((section, index) => {
            const order = section.order ?? index;
            return (
              <a
                href={`#${sectionDomId(order)}`}
                key={section.sectionId ?? index}
                onClick={(event) => {
                  if (loadedOrders.has(order)) return;
                  event.preventDefault();
                  setJumpOrder(order);
                }}
              >
                {section.heading || `章节 ${index + 1}`}
              </a>
            );
          })}
        </nav>
        <article className="preview-content">
          <div className="preview-sentinel" ref={topSentinelRef} aria-hidden="true" />
          {sections.length ? sections.map((section, index) => (
            <section
              data-target={focusDomId && section.order === focusOrder ? 'true' : undefined}
              id={sectionDomId(section.order ?? index)}
              key={section.order ?? index}
              tabIndex={focusDomId && section.order === focusOrder ? -1 : undefined}
            >
              {section.heading ? <div className="preview-section-heading"><FileText size={17} /><h2>{section.heading}</h2></div> : null}
              <DocumentLocatorView locator={section.locator} />
              <p>{section.content || '此章节暂无可预览文本。'}</p>
            </section>
          )) : <p className="widget-empty">暂无可预览文本。</p>}
          {isFetchingNextPage ? <div aria-label="正在加载后续内容" className="preview-skeleton"><span /><span /><span /></div> : null}
          {sectionsQuery.isError && sections.length ? (
            <div className="preview-retry"><span>后续内容加载失败</span><Button onClick={() => void fetchNextPage()} variant="secondary">重试</Button></div>
          ) : null}
          {hasNextPage
            ? <div className="preview-sentinel" ref={bottomSentinelRef} aria-hidden="true" />
            : sections.length ? <p className="preview-end">已到底部</p> : null}
        </article>
      </div>
    </section>
  );
}
