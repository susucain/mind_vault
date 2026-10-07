import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LoaderCircle, TriangleAlert } from 'lucide-react';
import { fetchAnswerContext, fetchNeighborhood } from '../../api/graph';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { cn } from '../../lib/utils';
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS, ENTITY_TYPE_ORDER } from '../retrieval/graph-meta';
import { incidentEdges, mergeGraphViews } from '../retrieval/graph-model';
import { GraphCanvas } from '../retrieval/components/GraphCanvas';
import { NodeDetailCard } from '../retrieval/components/NodeDetailCard';
import { useGraphLayout } from '../retrieval/use-graph-layout';
import type { Citation, GraphView } from '../../types/domain';

const EMPTY_VIEW: GraphView = { focus: '', nodes: [], edges: [], truncated: false };

function locatorQuery(citation: Citation): string {
  const params = new URLSearchParams();
  Object.entries(citation.locator).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  const query = params.toString();
  return `/app/library/documents/${citation.documentId}/preview${query ? `?${query}` : ''}`;
}

/**
 * 回答相关图谱：入口是本轮回答实际引用的 chunk（回答侧没有实体名可作焦点）。
 * 默认折叠、展开时才请求——每轮回答都打一次图库没有意义；
 * 画布复用检索页的 GraphCanvas 与布局 hook，不另写一份实现。
 */
export function MessageGraph({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  const chunkIds = useMemo(
    () => [...new Set(citations.map((citation) => citation.chunkId).filter(Boolean))],
    [citations],
  );

  const query = useQuery({
    enabled: open && chunkIds.length > 0,
    queryKey: ['chat', 'answer-graph', chunkIds.join(',')],
    queryFn: () => fetchAnswerContext({ chunkIds, limit: 40 }),
  });

  // 节点展开是本地交互（同一次展开期间有效），与检索页的会话级持久化不同——
  // 回答随时会滚动出新，不值得为它维护跨刷新的探索状态
  const [expansions, setExpansions] = useState<Record<string, GraphView>>({});
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const view = useMemo(() => {
    const active = Object.entries(expansions)
      .filter(([id]) => !collapsedIds.includes(id))
      .map(([, expansion]) => expansion);
    return mergeGraphViews(query.data ?? EMPTY_VIEW, active);
  }, [query.data, expansions, collapsedIds]);

  const { canvasRef, positions, pending, slow } = useGraphLayout(view);

  const nodesById = useMemo(() => new Map(view.nodes.map((node) => [node.id, node])), [view.nodes]);
  const selectedNode = view.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdges = selectedNodeId ? incidentEdges(view, selectedNodeId) : [];
  // 关系证据指回原文：chunkId → 该引用所在文档的精确位置
  const evidencePaths = useMemo(
    () => new Map(citations.map((citation) => [citation.chunkId, locatorQuery(citation)])),
    [citations],
  );

  if (chunkIds.length === 0) return null;

  function toggleExpand(id: string) {
    if (expansions[id]) {
      setCollapsedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
      return;
    }
    setExpandingId(id);
    void fetchNeighborhood({ entity: id, maxHops: 1, limit: 60 })
      .then((result) => {
        setExpansions((prev) => ({ ...prev, [id]: result }));
        setCollapsedIds((prev) => prev.filter((item) => item !== id));
      })
      .finally(() => setExpandingId(null));
  }

  return (
    <section className="message-graph">
      <button
        aria-expanded={open}
        className="message-graph__toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ChevronDown aria-hidden="true" className={cn('message-graph__chevron', open && 'is-open')} size={14} />
        相关知识图谱
        <span className="message-graph__hint">{open ? '收起' : `${chunkIds.length} 个来源分块`}</span>
      </button>

      {open ? (
        <div className="message-graph__body">
          {query.isLoading ? (
            <LoadingState label="正在加载相关图谱…" />
          ) : query.isError ? (
            <ErrorState onRetry={() => void query.refetch()} title="图谱加载失败，可稍后重试" />
          ) : view.nodes.length === 0 ? (
            <EmptyState description="本轮引用尚未抽取到实体关系。" title="暂无相关图谱" />
          ) : (
            <>
              {view.truncated ? (
                <p className="message-graph__notice" role="status">
                  <TriangleAlert aria-hidden="true" size={13} />
                  图谱较大，已截断展示
                </p>
              ) : null}
              <div className="message-graph__canvas" ref={canvasRef}>
                <GraphCanvas
                  onExpandNode={toggleExpand}
                  onSelectNode={setSelectedNodeId}
                  positions={positions}
                  selectedNodeId={selectedNodeId}
                  view={view}
                />
                {pending ? (
                  <div className={cn('graph-panel__overlay', slow && 'graph-panel__overlay--hint')} role="status">
                    <LoaderCircle aria-hidden="true" size={18} />
                    {slow ? '布局仍在计算…' : '正在计算图谱布局…'}
                  </div>
                ) : null}
              </div>
              <p className="graph-panel__legend">
                {ENTITY_TYPE_ORDER.map((type) => (
                  <span className="graph-panel__legend-item" key={type}>
                    <i style={{ background: ENTITY_TYPE_COLORS[type] }} />
                    {ENTITY_TYPE_LABELS[type]}
                  </span>
                ))}
              </p>
              {selectedNode ? (
                <NodeDetailCard
                  collapsed={collapsedIds.includes(selectedNode.id)}
                  edges={selectedEdges}
                  evidencePaths={evidencePaths}
                  expanded={Boolean(expansions[selectedNode.id]) && !collapsedIds.includes(selectedNode.id)}
                  expanding={expandingId === selectedNode.id}
                  node={selectedNode}
                  nodesById={nodesById}
                  onToggleExpand={toggleExpand}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
