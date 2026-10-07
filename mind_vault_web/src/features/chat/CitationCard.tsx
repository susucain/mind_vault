import { ExternalLink, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HighlightText } from '../retrieval/components/HighlightText';
import type { Citation, DocumentLocator } from '../../types/domain';

function locatorQuery(locator: DocumentLocator): string {
  const params = new URLSearchParams();
  Object.entries(locator).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}

/** 文档已被删除或名称缺失时的中性占位，避免把裸 ID 当标题显示 */
const UNKNOWN_DOCUMENT = '未知文档';

export function CitationCard({ citation, onOpen }: { citation: Citation; onOpen?: () => void }) {
  const query = locatorQuery(citation.locator);
  const documentName = citation.documentName || UNKNOWN_DOCUMENT;
  return (
    <article className="citation-card">
      <div className="citation-card__heading">
        <FileText aria-hidden="true" size={16} />
        <strong title={citation.documentName || undefined}>{documentName}</strong>
      </div>
      {/* 命中关键字按分段渲染；无分段（语义路径 / 存量数据）时回退原文 */}
      <p><HighlightText fallback={citation.excerpt} segments={citation.highlight ?? null} /></p>
      <Link aria-label={`打开 ${documentName} 的精确位置`} className="citation-card__link" onClick={onOpen} to={`/app/library/documents/${citation.documentId}/preview${query ? `?${query}` : ''}`}>
        <ExternalLink aria-hidden="true" size={14} />打开原文位置
      </Link>
    </article>
  );
}
