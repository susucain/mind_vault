import { ExternalLink, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Citation, DocumentLocator } from '../../types/domain';

function locatorQuery(locator: DocumentLocator): string {
  const params = new URLSearchParams();
  Object.entries(locator).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}

export function CitationCard({ citation, onOpen }: { citation: Citation; onOpen?: () => void }) {
  const query = locatorQuery(citation.locator);
  return (
    <article className="citation-card">
      <div className="citation-card__heading"><FileText aria-hidden="true" size={16} /><strong>{citation.documentName || citation.documentId}</strong></div>
      <p>{citation.excerpt}</p>
      <Link aria-label={`打开 ${citation.documentName} 的精确位置`} className="citation-card__link" onClick={onOpen} to={`/app/library/documents/${citation.documentId}/preview${query ? `?${query}` : ''}`}>
        <ExternalLink aria-hidden="true" size={14} />打开原文位置
      </Link>
    </article>
  );
}
