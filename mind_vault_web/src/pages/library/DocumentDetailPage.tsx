import { ArrowLeft, Check, Circle, Eye, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, LoadingState, StatusBadge } from '../../components/ui';
import { documentStatus, documentStatusLabel, documentTone, formatDate, formatFileSize } from '../../features/documents/document-utils';
import { useDocument } from '../../features/documents/use-document';
import { LibraryNav } from '../../features/library/LibraryNav';

const stages = ['上传', '解析', '分块', '向量索引', '可问答'];

export function DocumentDetailPage() {
  const { documentId } = useParams();
  const query = useDocument(documentId);

  if (query.isPending) return <LoadingState label="加载文档" />;
  if (query.isError || !query.data) return <section className="state-panel state-panel--error"><h2>文档加载失败</h2><Button onClick={() => void query.refetch()} variant="secondary">重试</Button></section>;
  const document = query.data;
  const ready = documentStatus(document) === 'ready';
  const coverage = ready ? 100 : document.ingestionProgress?.percent ?? 0;
  const tags = document.tags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [];

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
            <div className="coverage-value"><strong>{coverage}%</strong><span>可检索内容</span></div>
            <progress max="100" value={coverage} />
          </section>
          <section className="workspace-panel">
            <h2>处理阶段</h2>
            <ol className="stage-list">{stages.map((stage, index) => {
              const complete = ready || index < Math.ceil((coverage / 100) * stages.length);
              return <li data-complete={complete} key={stage}>{complete ? <Check size={15} /> : <Circle size={15} />}<span>{stage}</span></li>;
            })}</ol>
          </section>
        </aside>
      </div>
    </section>
  );
}
