import { ArrowLeft, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, LoadingState } from '../../components/ui';
import { DocumentLocatorView } from '../../features/documents/DocumentLocator';
import { useDocument } from '../../features/documents/use-document';

export function DocumentPreviewPage() {
  const { documentId } = useParams();
  const query = useDocument(documentId);

  if (query.isPending) return <LoadingState label="加载原文" />;
  if (query.isError || !query.data) return <section className="state-panel state-panel--error"><h2>原文加载失败</h2><Button onClick={() => void query.refetch()} variant="secondary">重试</Button></section>;
  const document = query.data;

  return (
    <section className="document-preview page-section">
      <header className="preview-header">
        <Link aria-label="返回文档详情" className="icon-button" to={`/app/library/documents/${document.id}`}><ArrowLeft size={18} /></Link>
        <div><p className="eyebrow">原文预览</p><h1>{document.title}</h1></div>
      </header>
      <div className="preview-layout">
        <nav aria-label="章节目录" className="preview-outline">
          <h2>章节</h2>
          {(document.sections ?? []).map((section, index) => <a href={`#section-${index}`} key={`${section.heading}-${index}`}>{section.heading || `章节 ${index + 1}`}</a>)}
        </nav>
        <article className="preview-content">
          {document.sections?.length ? document.sections.map((section, index) => (
            <section id={`section-${index}`} key={`${section.heading}-${index}`}>
              <div className="preview-section-heading"><FileText size={17} /><h2>{section.heading || `章节 ${index + 1}`}</h2></div>
              <DocumentLocatorView locator={section.locator} />
              <p>{section.content || '此章节暂无可预览文本。'}</p>
            </section>
          )) : <pre>{document.content || '暂无可预览文本。'}</pre>}
        </article>
      </div>
    </section>
  );
}
