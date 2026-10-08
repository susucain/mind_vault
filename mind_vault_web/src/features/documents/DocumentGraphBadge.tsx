import { LoaderCircle, Network, RotateCcw } from 'lucide-react';
import type { Document } from '../../types/domain';

interface DocumentGraphBadgeProps {
  document: Document;
  /** 补建入口：未开启或失败时点击回调；由调用方负责请求与刷新 */
  onBuild: (documentId: string) => void;
  /** 补建请求进行中（列表级别，避免同一行重复点击） */
  building?: boolean;
}

/**
 * 图谱状态徽标：把「默认不构建图谱」这件事显性化。
 *
 * - `graphEnabled === false` → 可点击的「未构建图谱」补建入口
 * - 已开启但未终结（含 NOT_STARTED）→「图谱构建中」并带 chunk 进度
 * - `FAILED` → 可点击重试
 * - `READY` →「图谱就绪」
 * - 列表接口未返回 `graphEnabled`（如本地待上传条目）→ 不渲染
 */
export function DocumentGraphBadge({ document, building = false, onBuild }: DocumentGraphBadgeProps) {
  if (typeof document.graphEnabled !== 'boolean') return null;
  const graph = document.graph ?? null;

  if (!document.graphEnabled) {
    return (
      <button
        className="graph-badge graph-badge--idle"
        disabled={building}
        onClick={() => onBuild(document.id)}
        title="默认不构建图谱，点击为这份文档补建"
        type="button"
      >
        {building ? (
          <LoaderCircle aria-hidden="true" className="graph-badge__spin" size={13} />
        ) : (
          <Network aria-hidden="true" size={13} />
        )}
        {building ? '正在入队' : '未构建图谱'}
      </button>
    );
  }

  if (graph?.status === 'FAILED') {
    return (
      <button
        className="graph-badge graph-badge--failed"
        disabled={building}
        onClick={() => onBuild(document.id)}
        title="点击重试未完成的图谱抽取"
        type="button"
      >
        <RotateCcw aria-hidden="true" size={13} />
        图谱构建失败{graph.failed > 0 ? `（${graph.failed} 块）` : ''}
      </button>
    );
  }

  if (graph?.status === 'READY') {
    return (
      <span className="graph-badge graph-badge--ready">
        <Network aria-hidden="true" size={13} />
        图谱就绪
      </span>
    );
  }

  return (
    <span className="graph-badge graph-badge--building">
      <LoaderCircle aria-hidden="true" className="graph-badge__spin" size={13} />
      图谱构建中{graph && graph.total > 0 ? ` ${graph.completed}/${graph.total}` : ''}
    </span>
  );
}
