import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, FileText, List } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Components } from 'streamdown';
import { Button, Drawer, LoadingState } from '../../components/ui';
import { MarkdownViewer } from '../../features/chat';
import { AssetImage } from '../../features/documents/AssetImage';
import { DocumentLocatorView } from '../../features/documents/DocumentLocator';
import { DocumentOutlineNav } from '../../features/documents/DocumentOutline';
import { useActiveSection } from '../../features/documents/use-active-section';
import {
  READING_FONT_OPTIONS,
  READING_LINE_OPTIONS,
  readingStyle,
  useReadingPreferences,
} from '../../features/documents/reading-preferences';
import { sectionDomId } from '../../features/documents/document-utils';
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

/** 平滑滚动；用户声明减少动效时改为即时跳转。 */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * 段落级分流依据：命中任一块级 Markdown 语法才交给 streamdown。
 *
 * 真实语料以 PDF 逐行抽取的纯文本为主（大量硬换行），整节交给 Markdown
 * 渲染会把换行合并成一整段；只在确有结构时渲染，纯文本段落保留换行。
 */
const MARKDOWN_BLOCK_PATTERNS = [
  /^#{1,6}\s+\S/m,
  /^\s*(?:```|~~~)/m,
  /^\s*>\s?\S/m,
  /^\s*(?:[-*+]|\d{1,9}[.)])\s+\S/m,
  /^\s*\|.*\|\s*$/m,
  /!\[[^\]]*\]\([^)]*\)/,
];

function isMarkdownBlock(text: string): boolean {
  return MARKDOWN_BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((part) => part.replace(/^\n+|\n+$/g, ''))
    .filter((part) => part.trim().length > 0);
}

const MARKDOWN_IMAGE_PATTERN = /(!\[[^\]]*\]\()([^)\s]+)(\))/g;
const ABSOLUTE_SRC_PATTERN = /^(?:https?:|\/|data:|blob:)/i;

/**
 * 正文里的插图是相对 key（如 `pdf-images/x.png`）。streamdown 会校验图片地址，
 * 裸相对路径无法解析成 URL 而被替换为「Image blocked」占位；补上前导 `/`
 * 使其成为根相对路径即可放行，真正的取图仍由 AssetImage 带鉴权完成。
 */
function toRootRelativeAssets(text: string): string {
  return text.replace(
    MARKDOWN_IMAGE_PATTERN,
    (_match, prefix: string, src: string, suffix: string) =>
      ABSOLUTE_SRC_PATTERN.test(src) ? `${prefix}${src}${suffix}` : `${prefix}/${src}${suffix}`,
  );
}

/** 正文内标题降级到 h3 起，保证每页只有文档标题 h1 与章节标题 h2。 */
const PREVIEW_MARKDOWN_COMPONENTS: Components = {
  img: ({ alt, src }) => (
    <AssetImage
      alt={alt}
      assetKey={typeof src === 'string' ? src.replace(/^\/+/, '') : undefined}
    />
  ),
  h1: 'h3',
  h2: 'h4',
  h3: 'h5',
  h4: 'h6',
};

function SectionBody({ content }: { content?: string }) {
  const paragraphs = useMemo(() => splitParagraphs(content ?? ''), [content]);
  if (!paragraphs.length) {
    return <p className="preview-paragraph">此章节暂无可预览文本。</p>;
  }
  return (
    <>
      {paragraphs.map((paragraph, index) =>
        isMarkdownBlock(paragraph) ? (
          <MarkdownViewer
            components={PREVIEW_MARKDOWN_COMPONENTS}
            content={toRootRelativeAssets(paragraph)}
            key={`block-${index}`}
            mode="static"
          />
        ) : (
          <p className="preview-paragraph" key={`text-${index}`}>{paragraph}</p>
        ),
      )}
    </>
  );
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
  /** 用户显式「回到顶部」期间置位：抑制上插补偿，否则视图会被推回原处。 */
  const pinTopRef = useRef(false);
  const loadEarlier = useCallback(async () => {
    const anchorTop = window.scrollY;
    const anchorHeight = document.documentElement.scrollHeight;
    await fetchPreviousPage();
    requestAnimationFrame(() => {
      if (pinTopRef.current) return;
      const delta = document.documentElement.scrollHeight - anchorHeight;
      if (delta !== 0) window.scrollTo({ top: anchorTop + delta });
    });
  }, [fetchPreviousPage]);

  // 更早内容取完（或窗口被跳转重建）后，置顶意图即失效
  useEffect(() => {
    if (!hasPreviousPage) pinTopRef.current = false;
  }, [hasPreviousPage]);

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

  // 目录联动：已渲染正文块按 order 正序，作为 scroll-spy 的观测范围
  const loadedOrderList = useMemo(
    () => sections.map((section, index) => section.order ?? index),
    [sections],
  );
  const { activeOrder, selectOrder } = useActiveSection(loadedOrderList);
  const { preferences, update: updatePreferences } = useReadingPreferences();
  const [outlineOpen, setOutlineOpen] = useState(false);

  const activeIndex = useMemo(() => {
    if (activeOrder === undefined) return 0;
    const index = outlineSections.findIndex(
      (section, position) => (section.order ?? position) === activeOrder,
    );
    return index < 0 ? 0 : index;
  }, [activeOrder, outlineSections]);
  const previousSection = activeIndex > 0 ? outlineSections[activeIndex - 1] : undefined;
  const nextSection = activeIndex < outlineSections.length - 1 ? outlineSections[activeIndex + 1] : undefined;

  /** 目录跳转：已渲染的平滑滚过去，未渲染的重建分页（复用深链机制）。 */
  const goToSection = useCallback((order: number) => {
    selectOrder(order);
    setOutlineOpen(false);
    if (loadedOrders.has(order)) {
      document.getElementById(sectionDomId(order))?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      return;
    }
    setJumpOrder(order);
    pinTopRef.current = false;
  }, [loadedOrders, selectOrder]);

  // 阅读进度：整页滚动比例（短文档无滚动时视为已读完）
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 1;
      const value = Math.min(100, Math.max(0, Math.round(ratio * 100)));
      setProgress((previous) => (previous === value ? previous : value));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    // 上方还有更早内容时置顶抑制：否则加载回来的内容会把视图推回原处
    pinTopRef.current = hasPreviousPage;
    window.scrollTo({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', top: 0 });
  }, [hasPreviousPage]);

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
      <div
        aria-label="阅读进度"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className="preview-progress"
        role="progressbar"
      >
        <span aria-hidden="true" style={{ width: `${progress}%` }} />
      </div>
      <header className="preview-header">
        <Link aria-label="返回文档详情" className="icon-button" to={`/app/library/documents/${outline.documentId}`}><ArrowLeft size={18} /></Link>
        <div><p className="eyebrow">原文预览</p><h1>{outline.title}</h1></div>
      </header>
      <div className="preview-toolbar">
        <button
          className="preview-toolbar__option preview-toolbar__outline"
          onClick={() => setOutlineOpen(true)}
          type="button"
        >
          <List aria-hidden="true" size={14} />目录
        </button>
        <div aria-label="字号" className="preview-toolbar__group" role="group">
          <span aria-hidden="true" className="preview-toolbar__label">字号</span>
          {READING_FONT_OPTIONS.map((option) => (
            <button
              aria-label={`字号${option.label}`}
              aria-pressed={preferences.fontSize === option.value}
              className="preview-toolbar__option"
              key={option.value}
              onClick={() => updatePreferences({ fontSize: option.value })}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div aria-label="行距" className="preview-toolbar__group" role="group">
          <span aria-hidden="true" className="preview-toolbar__label">行距</span>
          {READING_LINE_OPTIONS.map((option) => (
            <button
              aria-label={`行距${option.label}`}
              aria-pressed={preferences.lineHeight === option.value}
              className="preview-toolbar__option"
              key={option.value}
              onClick={() => updatePreferences({ lineHeight: option.value })}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <span aria-hidden="true" className="preview-toolbar__progress">{progress}%</span>
        <div className="preview-toolbar__chapter">
          <button
            className="preview-toolbar__option"
            disabled={!previousSection}
            onClick={() => previousSection && goToSection(previousSection.order ?? 0)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={14} />上一章
          </button>
          <button
            className="preview-toolbar__option"
            disabled={!nextSection}
            onClick={() => nextSection && goToSection(nextSection.order ?? 0)}
            type="button"
          >
            下一章<ChevronRight aria-hidden="true" size={14} />
          </button>
          <button className="preview-toolbar__option" onClick={scrollToTop} type="button">
            <ArrowUp aria-hidden="true" size={14} />回到顶部
          </button>
        </div>
      </div>
      <div className="preview-layout">
        <nav aria-label="章节目录" className="preview-outline">
          <h2>章节</h2>
          <DocumentOutlineNav activeOrder={activeOrder} onSelect={goToSection} sections={outlineSections} />
        </nav>
        <article className="preview-content" style={readingStyle(preferences)}>
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
              <SectionBody content={section.content} />
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
      <Drawer onOpenChange={setOutlineOpen} open={outlineOpen} side="bottom" title="章节目录">
        <DocumentOutlineNav activeOrder={activeOrder} onSelect={goToSection} sections={outlineSections} />
      </Drawer>
    </section>
  );
}
