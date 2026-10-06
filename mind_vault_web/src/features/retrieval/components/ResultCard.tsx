import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RetrievalSource, ScoreKind, SearchResultItem } from '@/types/domain';
import { DocumentLocatorView } from '@/features/documents/DocumentLocator';
import { documentPreviewPath } from '@/features/documents/document-utils';
import { HighlightText } from './HighlightText';

const SOURCE_LABELS: Record<RetrievalSource, string> = {
  keyword: '关键字',
  vector: '语义',
  graph: '图谱',
};

/** 评分口径的中文说明：避免把后端枚举（如 normalized_bm25）直接暴露给用户。 */
const SCORE_KIND_LABELS: Record<ScoreKind, string> = {
  normalized_bm25: '关键字相关度',
  cosine_similarity: '语义相似度',
  graph_degree: '图谱关联数',
  rrf_fusion: '融合排序分',
};

/** 各模式评分量纲不同，按 scoreKind 决定展示形态（见设计方案 4.7.5）。 */
function scorePresentation(item: SearchResultItem): { label: string; percent: number | null } {
  if (item.scoreKind === 'graph_degree') {
    return { label: `关联 ${item.score} 条`, percent: null };
  }
  if (item.scoreKind === 'rrf_fusion') {
    return { label: item.score.toFixed(3), percent: null };
  }
  return { label: item.score.toFixed(2), percent: Math.max(0, Math.min(1, item.score)) * 100 };
}

export function ResultCard({ item }: { item: SearchResultItem }) {
  const score = scorePresentation(item);
  const scoreKindLabel = SCORE_KIND_LABELS[item.scoreKind];

  return (
    <article className="retrieval-card">
      <header className="retrieval-card__head">
        <div className="retrieval-card__score" title={scoreKindLabel}>
          <span className="sr-only">{scoreKindLabel}</span>
          {score.percent !== null ? (
            <span aria-hidden="true" className="retrieval-card__score-bar">
              <span style={{ width: `${score.percent}%` }} />
            </span>
          ) : null}
          <span className="retrieval-card__score-value">{score.label}</span>
        </div>
        <div className="retrieval-card__title">
          <strong>{item.documentTitle || item.documentId}</strong>
          {item.titlePath.length ? <span>{item.titlePath.join(' / ')}</span> : null}
        </div>
        <DocumentLocatorView locator={item.locator} />
      </header>

      <p className="retrieval-card__body">
        <HighlightText fallback={item.text} segments={item.highlight} />
      </p>

      <footer className="retrieval-card__foot">
        <div className="retrieval-card__sources">
          {item.sources.map((source) => (
            <span className="dataset-tag" key={source}>
              {SOURCE_LABELS[source]}
            </span>
          ))}
          {item.datasetNames.length ? (
            <span className="retrieval-card__datasets">{item.datasetNames.join(' · ')}</span>
          ) : null}
        </div>
        <Link className="citation-card__link" to={documentPreviewPath(item.documentId, item.locator)}>
          <ExternalLink aria-hidden="true" size={14} />
          查看原文
        </Link>
      </footer>
    </article>
  );
}
