import type { RetrievalMode, RetrievalSource } from '@/types/domain';
import { MODE_LABELS } from '../mode-meta';

const SOURCE_LABELS: Record<RetrievalSource, string> = {
  keyword: '关键字',
  vector: '语义',
  graph: '图谱',
};

interface ResultsStatsBarProps {
  total: number;
  tookMs: number;
  bySource: Partial<Record<RetrievalSource, number>>;
  mode: RetrievalMode;
  loading?: boolean;
  truncated?: boolean;
}

export function ResultsStatsBar({ total, tookMs, bySource, mode, loading, truncated }: ResultsStatsBarProps) {
  if (loading) {
    return (
      <div aria-live="polite" className="retrieval-stats">
        检索中…
      </div>
    );
  }

  const sources = (Object.keys(bySource) as RetrievalSource[]).filter((source) => (bySource[source] ?? 0) > 0);

  return (
    <div aria-live="polite" className="retrieval-stats">
      <span>
        {MODE_LABELS[mode]} · 共 {total} 条
      </span>
      <span>用时 {tookMs} ms</span>
      {sources.length > 1
        ? sources.map((source) => (
            <span className="retrieval-stats__source" key={source}>
              {SOURCE_LABELS[source]} {bySource[source]}
            </span>
          ))
        : null}
      {truncated ? <span className="retrieval-stats__notice">结果较多，已截断</span> : null}
    </div>
  );
}
