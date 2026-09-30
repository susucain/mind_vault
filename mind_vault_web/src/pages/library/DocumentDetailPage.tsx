import { AlertCircle, ArrowLeft, Eye, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, LoadingState, StatusBadge } from '../../components/ui';
import { documentStatusLabel, documentTone, formatDate, formatFileSize } from '../../features/documents/document-utils';
import { useDocument, useDocumentStatus } from '../../features/documents/use-document';
import { LibraryNav } from '../../features/library/LibraryNav';

export function DocumentDetailPage() {
  const { documentId } = useParams();
  const query = useDocument(documentId);
  const statusQuery = useDocumentStatus(documentId);

  if (query.isPending) return <LoadingState label="加载文档" />;
  if (query.isError || !query.data) return <section className="state-panel state-panel--error"><h2>文档加载失败</h2><Button onClick={() => void query.refetch()} variant="secondary">重试</Button></section>;
  const document = query.data;
  const tags = document.tags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [];
  const processing = statusQuery.data;

  return (
    <section className="document-detail page-section">
      <Link className="back-link" to="/app/library"><ArrowLeft size={16} />返回文件列表</Link>
      <header className="page-heading">
        <div><p className="eyebrow">文档详情</p><h1>{document.title}</h1></div>
        <StatusBadge tone={documentTone(document)}>{documentStatusLabel(document)}</StatusBadge>
      </header>
      <LibraryNav />
      <div className="document-detail-grid">
        <div className="document-main">
          <section className="workspace-panel metadata-panel">
            <div className="section-heading"><h2>文件信息</h2><Link to={`/app/library/documents/${document.id}/preview`}><Eye size={16} />查看原文</Link></div>
            <dl>
              <div><dt>源文件</dt><dd>{document.sourceFileName || document.title}</dd></div>
              <div><dt>格式</dt><dd>{document.sourceFileExtension || '未知'}</dd></div>
              <div><dt>大小</dt><dd>{formatFileSize(document.sourceFileSize)}</dd></div>
              <div><dt>页数</dt><dd>{document.pageCount ?? '未知'}</dd></div>
              <div><dt>字数</dt><dd>{document.wordCount?.toLocaleString('zh-CN') ?? '未知'}</dd></div>
              <div><dt>更新</dt><dd>{formatDate(document.updatedAt || document.createdAt)}</dd></div>
            </dl>
            {document.summary ? <p className="document-summary">{document.summary}</p> : null}
            <div className="tag-list">{tags.length ? tags.map((tag) => <span key={tag}>{tag}</span>) : <span>暂无标签</span>}</div>
          </section>
          <section className="workspace-panel">
            <div className="section-heading"><h2>章节</h2><span>{document.sections?.length ?? 0} 节</span></div>
            {document.sections?.length ? <ol className="chapter-list">{document.sections.map((section, index) => <li key={`${section.heading}-${index}`}><FileText size={16} /><span>{section.heading || `章节 ${index + 1}`}</span></li>)}</ol> : <p className="widget-empty">解析完成后显示章节。</p>}
          </section>
        </div>
        <aside className="document-side">
          <section className="workspace-panel">
            <h2>索引覆盖</h2>
            {statusQuery.isPending ? <LoadingState label="加载处理进度" /> : statusQuery.isError ? (
              <div className="widget-state"><span>处理状态加载失败</span><Button onClick={() => void statusQuery.refetch()} variant="secondary">重试</Button></div>
            ) : (
              <>
                <div className="coverage-value"><strong>{processing?.stageProgress.percent ?? 0}%</strong><span>当前阶段进度</span></div>
                <progress max="100" value={processing?.stageProgress.percent ?? 0} />
              </>
            )}
          </section>
          <section className="workspace-panel">
            <h2>处理阶段</h2>
            {processing ? (
              <div className="current-stage">
                <span>当前阶段</span>
                <strong>{processing.currentStage || processing.status}</strong>
                <span>{processing.stageProgress.completed} / {processing.stageProgress.total}</span>
                {processing.errorMessage ? <p className="form-error"><AlertCircle size={15} />{processing.errorMessage}</p> : null}
              </div>
            ) : <p className="widget-empty">暂无处理状态。</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
