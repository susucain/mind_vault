import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, PanelRightClose, TriangleAlert } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { computeGraphLayout, type LayoutPosition } from '../graph-layout';
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS, ENTITY_TYPE_ORDER } from '../graph-meta';
import type { GraphExplorationResult } from '../use-graph-exploration';
import { GraphCanvas } from './GraphCanvas';
import { GraphFilterBar } from './GraphFilterBar';
import { NodeDetailCard } from './NodeDetailCard';

/** 超过该时长布局仍未返回则提示可缩小跳数（见设计方案 4.4.3）。 */
const SLOW_LAYOUT_MS = 1500;

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

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  // 布局结果与其对应的节点/边指纹：指纹不一致即表示布局仍在计算（避免同步 setState）
  const [layout, setLayout] = useState<{ key: string; positions: Record<string, LayoutPosition> }>({
    key: '',
    positions: {},
  });
  const [slowKey, setSlowKey] = useState('');

  // 画布尺寸随视口与栅格变化，且力导向布局依赖容器尺寸：尺寸变化必须重算，否则节点会落在可视区外
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setCanvasSize((prev) =>
        prev && Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layoutKey = useMemo(
    () =>
      `${view.nodes.map((node) => node.id).join(',')}|${view.edges.map((edge) => edge.id).join(',')}` +
      `|${canvasSize ? `${Math.round(canvasSize.width)}x${Math.round(canvasSize.height)}` : ''}`,
    [view.nodes, view.edges, canvasSize],
  );

  // 节点/边集合或画布尺寸变化（检索、展开、折叠、过滤、窗口缩放）后重算力导向布局
  useEffect(() => {
    if (view.nodes.length === 0 || !canvasSize) return;

    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlowKey(layoutKey);
    }, SLOW_LAYOUT_MS);

    void computeGraphLayout({
      nodes: view.nodes.map((node) => ({ id: node.id })),
      edges: view.edges.map((edge) => ({ source: edge.source, target: edge.target })),
      width: canvasSize.width,
      height: canvasSize.height,
    }).then((result) => {
      if (cancelled) return;
      window.clearTimeout(slowTimer);
      setLayout({ key: layoutKey, positions: result.positions });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [layoutKey, view.nodes, view.edges]);

  const layoutPending = view.nodes.length > 0 && layout.key !== layoutKey;
  const layoutSlow = layoutPending && slowKey === layoutKey;

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
              positions={layout.positions}
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
