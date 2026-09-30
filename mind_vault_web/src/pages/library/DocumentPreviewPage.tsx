import { useEffect } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Button, LoadingState } from '../../components/ui';
import { DocumentLocatorView } from '../../features/documents/DocumentLocator';
import { useDocument } from '../../features/documents/use-document';
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

function sectionDomId(section: DocumentSection, index: number): string {
  return section.sectionId || `section-${index}`;
}

export function DocumentPreviewPage() {
  const { documentId } = useParams();
  const location = useLocation();
  const query = useDocument(documentId);
  const target = selectedLocator(location.search, location.hash);
  const targetIndex = query.data?.sections?.findIndex((section) => isTarget(section, target)) ?? -1;

  useEffect(() => {
    const targetSection = targetIndex >= 0 ? query.data?.sections?.[targetIndex] : undefined;
    if (targetSection) document.getElementById(sectionDomId(targetSection, targetIndex))?.scrollIntoView?.({ block: 'center' });
  }, [query.data?.sections, targetIndex]);

  if (query.isPending) return <LoadingState label="加载原文" />;
  if (query.isError || !query.data) return <section className="state-panel state-panel--error"><h2>原文加载失败</h2><Button onClick={() => void query.refetch()} variant="secondary">重试</Button></section>;
  const sourceDocument = query.data;

  return (
    <section className="document-preview page-section">
      <header className="preview-header">
        <Link aria-label="返回文档详情" className="icon-button" to={`/app/library/documents/${sourceDocument.id}`}><ArrowLeft size={18} /></Link>
        <div><p className="eyebrow">原文预览</p><h1>{sourceDocument.title}</h1></div>
      </header>
      <div className="preview-layout">
        <nav aria-label="章节目录" className="preview-outline">
          <h2>章节</h2>
          {(sourceDocument.sections ?? []).map((section, index) => <a href={`#${sectionDomId(section, index)}`} key={`${section.heading}-${index}`}>{section.heading || `章节 ${index + 1}`}</a>)}
        </nav>
        <article className="preview-content">
          {sourceDocument.sections?.length ? sourceDocument.sections.map((section, index) => (
            <section data-target={index === targetIndex ? 'true' : undefined} id={sectionDomId(section, index)} key={`${section.heading}-${index}`} tabIndex={index === targetIndex ? -1 : undefined}>
              <div className="preview-section-heading"><FileText size={17} /><h2>{section.heading || `章节 ${index + 1}`}</h2></div>
              <DocumentLocatorView locator={section.locator} />
              <p>{section.content || '此章节暂无可预览文本。'}</p>
            </section>
          )) : <pre>{sourceDocument.content || '暂无可预览文本。'}</pre>}
        </article>
      </div>
    </section>
  );
}
