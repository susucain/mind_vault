import { useMemo } from 'react';
import { LoaderCircle, PanelRightClose, TriangleAlert } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS, ENTITY_TYPE_ORDER } from '../graph-meta';
import { useGraphLayout } from '../use-graph-layout';
import type { GraphExplorationResult } from '../use-graph-exploration';
import { GraphCanvas } from './GraphCanvas';
import { GraphFilterBar } from './GraphFilterBar';
import { NodeDetailCard } from './NodeDetailCard';

interface GraphPanelProps {
  exploration: GraphExplorationResult;
  /** chunkId → 原文预览深链，用于关系证据跳转 */
  evidencePaths: Map<string, string>;
  /** 桌面端收起整个图谱区 / 移动端关闭抽屉 */
  onCollapse?: () => void;
  collapseLabel?: string;
}

/** 图谱容器：负责布局触发、画布与节点详情的装配（见设计方案 4.6.1）。 */
export function GraphPanel({ exploration, evidencePaths, onCollapse, collapseLabel = '收起' }: GraphPanelProps) {
  const {
    view,
    isLoading,
    isError,
    refetch,
    selectedNode,
    selectedEdges,
    selectNode,
    isExpanded,
    isCollapsed,
    expandingId,
    toggleExpand,
    filters,
    setFilters,
  } = exploration;

  const { canvasRef, positions, pending: layoutPending, slow: layoutSlow } = useGraphLayout(view);

  const nodesById = useMemo(() => new Map(view.nodes.map((node) => [node.id, node])), [view.nodes]);

  return (
    <section aria-label="图谱" className="graph-panel">
      <header className="graph-panel__head">
        <div className="graph-panel__title">
          <h2>图谱</h2>
          <span className="graph-panel__count">
            {view.nodes.length} 节点 · {view.edges.length} 条关系
          </span>
        </div>
        <div className="graph-panel__actions">
          <GraphFilterBar filters={filters} onChange={setFilters} />
          {onCollapse ? (
            <Button onClick={onCollapse} variant="secondary">
              <PanelRightClose aria-hidden="true" size={14} />
              {collapseLabel}
            </Button>
          ) : null}
        </div>
      </header>

      {view.truncated ? (
        <p className="graph-panel__notice" role="status">
          <TriangleAlert aria-hidden="true" size={14} />
          图谱较大，已截断，请用过滤缩小范围
        </p>
      ) : null}

      <div className="graph-panel__canvas" ref={canvasRef}>
        {isLoading ? (
          <LoadingState label="正在检索图谱…" />
        ) : isError ? (
          <ErrorState onRetry={refetch} title="图谱检索失败，请稍后重试" />
        ) : view.nodes.length === 0 ? (
          <EmptyState
            description="输入实体名称后按回车，或点击热门实体开始探索。"
            title="还没有可展示的图谱"
          />
        ) : (
          <>
            <GraphCanvas
              onExpandNode={toggleExpand}
              onSelectNode={selectNode}
              positions={positions}
              selectedNodeId={selectedNode?.id ?? null}
              view={view}
            />
            {layoutPending ? (
              <div
                className={cn('graph-panel__overlay', layoutSlow && 'graph-panel__overlay--hint')}
                role="status"
              >
                <LoaderCircle aria-hidden="true" size={18} />
                {layoutSlow ? '布局仍在计算，可减小跳数加快速度…' : '正在计算图谱布局…'}
              </div>
            ) : null}
          </>
        )}
      </div>

      {view.nodes.length > 0 ? (
        <p className="graph-panel__legend">
          {ENTITY_TYPE_ORDER.map((type) => (
            <span className="graph-panel__legend-item" key={type}>
              <i style={{ background: ENTITY_TYPE_COLORS[type] }} />
              {ENTITY_TYPE_LABELS[type]}
            </span>
          ))}
        </p>
      ) : null}

      {selectedNode ? (
        <NodeDetailCard
          collapsed={isCollapsed(selectedNode.id)}
          edges={selectedEdges}
          evidencePaths={evidencePaths}
          expanded={isExpanded(selectedNode.id)}
          expanding={expandingId === selectedNode.id}
          node={selectedNode}
          nodesById={nodesById}
          onToggleExpand={toggleExpand}
        />
      ) : null}
    </section>
  );
}
