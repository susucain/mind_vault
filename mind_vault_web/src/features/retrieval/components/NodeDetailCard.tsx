import { ExternalLink, LoaderCircle, Maximize2, Minimize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { GraphEdge, GraphNode } from '@/types/domain';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ENTITY_TYPE_LABELS, RELATION_TYPE_LABELS } from '../graph-meta';

interface NodeDetailCardProps {
  node: GraphNode;
  edges: GraphEdge[];
  nodesById: Map<string, GraphNode>;
  expanded: boolean;
  collapsed: boolean;
  expanding: boolean;
  /** chunkId → 原文预览深链；图谱证据即检索命中的 chunk */
  evidencePaths: Map<string, string>;
  onToggleExpand: (id: string) => void;
}

export function NodeDetailCard({
  node,
  edges,
  nodesById,
  expanded,
  collapsed,
  expanding,
  evidencePaths,
  onToggleExpand,
}: NodeDetailCardProps) {
  const actionLabel = expanding ? '展开中…' : expanded ? '收起邻域' : collapsed ? '展开邻域' : '以此为焦点展开';

  return (
    <section className="graph-detail" aria-label="节点详情">
      <header className="graph-detail__head">
        <strong>{node.name}</strong>
        <span className={cn('graph-detail__type', `graph-detail__type--${node.type.toLowerCase()}`)}>
          {ENTITY_TYPE_LABELS[node.type]}
        </span>
        <span className="graph-detail__degree">关联 {node.degree} 条</span>
      </header>

      {node.aliases?.length ? (
        <p className="graph-detail__aliases">别名：{node.aliases.join('、')}</p>
      ) : null}

      <div className="graph-detail__actions">
        <Button
          disabled={expanding || node.degree === 0}
          onClick={() => onToggleExpand(node.id)}
          variant="secondary"
        >
          {expanding ? (
            <LoaderCircle aria-hidden="true" size={14} />
          ) : expanded ? (
            <Minimize2 aria-hidden="true" size={14} />
          ) : (
            <Maximize2 aria-hidden="true" size={14} />
          )}
          {actionLabel}
        </Button>
      </div>

      {edges.length ? (
        <ul className="graph-detail__relations">
          {edges.map((edge) => {
            const outward = edge.source === node.id;
            const otherId = outward ? edge.target : edge.source;
            const other = nodesById.get(otherId);
            const evidence = edge.sourceChunkId ? evidencePaths.get(edge.sourceChunkId) : undefined;
            return (
              <li key={edge.id}>
                <span className="graph-detail__relation">
                  <span aria-hidden="true">{outward ? '→' : '←'}</span>
                  {RELATION_TYPE_LABELS[edge.type]}
                  <strong>{other?.name ?? otherId}</strong>
                  {edge.confidence !== undefined ? (
                    <span className="graph-detail__confidence">{(edge.confidence * 100).toFixed(0)}%</span>
                  ) : null}
                </span>
                {evidence ? (
                  <Link className="graph-detail__evidence" to={evidence}>
                    <ExternalLink aria-hidden="true" size={12} />
                    查看证据
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="graph-detail__empty">当前视图内没有可见关系</p>
      )}
    </section>
  );
}
