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

/** 把 locator 渲染成可读定位文案（页码/幻灯片/工作表/行/JSONPath），无可用字段时返回空串 */
function locatorLabel(locator: DocumentLocator): string {
  const parts: string[] = [];
  if (locator.page !== undefined) parts.push(`第 ${locator.page} 页`);
  if (locator.slide !== undefined) parts.push(`第 ${locator.slide} 张幻灯片`);
  if (locator.sheet) {
    parts.push(`工作表 ${locator.sheet}${locator.cellRange ? ` ${locator.cellRange}` : ''}`);
  }
  if (locator.lineStart !== undefined) {
    parts.push(
      locator.lineEnd !== undefined && locator.lineEnd !== locator.lineStart
        ? `第 ${locator.lineStart}-${locator.lineEnd} 行`
        : `第 ${locator.lineStart} 行`,
    );
  }
  if (locator.jsonPath) parts.push(locator.jsonPath);
  return parts.join(' · ');
}

/** 文档已被删除或名称缺失时的中性占位，避免把裸 ID 当标题显示 */
const UNKNOWN_DOCUMENT = '未知文档';

export function CitationCard({ citation, onOpen }: { citation: Citation; onOpen?: () => void }) {
  const query = locatorQuery(citation.locator);
  const documentName = citation.documentName || UNKNOWN_DOCUMENT;
  const stale = Boolean(citation.stale);
  const position = locatorLabel(citation.locator);
  return (
    <article className={`citation-card${stale ? ' citation-card--stale' : ''}`}>
      <div className="citation-card__heading">
        <FileText aria-hidden="true" size={16} />
        <strong title={citation.documentName || undefined}>{documentName}</strong>
        {/* 文档重建后旧 chunkId 失效（§11.3）：正文不再回填，仅提示并给出定位 */}
        {stale ? <span className="citation-card__badge">片段已更新</span> : null}
      </div>
      {stale ? (
        <p className="citation-card__stale">{position ? `原文位置：${position}` : '原文位置已变更'}</p>
      ) : (
        // 命中关键字按分段渲染；无分段（语义路径 / 存量数据）时回退原文
        <p><HighlightText fallback={citation.excerpt} segments={citation.highlight ?? null} /></p>
      )}
      <Link aria-label={`打开 ${documentName} 的精确位置`} className="citation-card__link" onClick={onOpen} to={`/app/library/documents/${citation.documentId}/preview${query ? `?${query}` : ''}`}>
        <ExternalLink aria-hidden="true" size={14} />打开原文位置
      </Link>
    </article>
  );
}
