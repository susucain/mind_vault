import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchNeighborhood } from '@/api/graph';
import type { GraphEdge, GraphNode, GraphView } from '@/types/domain';
import { applyGraphFilters, emptyGraphFilters, incidentEdges, mergeGraphViews, type GraphFilters } from './graph-model';
import { useGraphNeighborhood } from './queries';

const STORAGE_PREFIX = 'mind-vault.graph-exploration.';
const MAX_PERSISTED_EXPANSIONS = 8;

const EMPTY_VIEW: GraphView = { focus: '', nodes: [], edges: [], truncated: false };

interface SessionState {
  expansions: Record<string, GraphView>;
  collapsedIds: string[];
  filters: GraphFilters;
}

function freshSession(): SessionState {
  return { expansions: {}, collapsedIds: [], filters: emptyGraphFilters() };
}

/** 图谱探索状态属会话内状态（不进 URL），存 sessionStorage 以便刷新恢复（见设计方案 4.4.2）。 */
function readSession(key: string): SessionState | null {
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    if (!parsed || typeof parsed !== 'object' || !parsed.expansions) return null;
    return {
      expansions: parsed.expansions,
      collapsedIds: Array.isArray(parsed.collapsedIds) ? parsed.collapsedIds : [],
      filters: parsed.filters ?? emptyGraphFilters(),
    };
  } catch {
    return null;
  }
}

function writeSession(key: string, state: SessionState): void {
  try {
    const entries = Object.entries(state.expansions).slice(-MAX_PERSISTED_EXPANSIONS);
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ ...state, expansions: Object.fromEntries(entries) }),
    );
  } catch {
    // sessionStorage 不可用（隐私模式 / 超限）时静默降级为纯内存状态
  }
}

export interface GraphExplorationResult {
  view: GraphView;
  /** 当前焦点实体（空串表示尚未发起探索），用于区分「初始引导」与「检索无结果」 */
  focus: string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  selectedNode: GraphNode | null;
  selectedEdges: GraphEdge[];
  selectNode: (id: string | null) => void;
  isExpanded: (id: string) => boolean;
  isCollapsed: (id: string) => boolean;
  expandingId: string | null;
  toggleExpand: (id: string) => void;
  collapse: (id: string) => void;
  filters: GraphFilters;
  setFilters: (filters: GraphFilters) => void;
}

export function useGraphExploration(input: {
  enabled: boolean;
  focus: string;
  maxHops: number;
  datasetIds: string[];
}): GraphExplorationResult {
  const focus = input.focus.trim();
  const sessionKey = focus ? `${focus}::${input.maxHops}` : '';

  const base = useGraphNeighborhood({
    entity: focus,
    maxHops: input.maxHops,
    datasetIds: input.datasetIds,
    enabled: input.enabled,
  });

  const [session, setSession] = useState<SessionState>(freshSession);
  const [hydratedKey, setHydratedKey] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandingId, setExpandingId] = useState<string | null>(null);

  // 焦点 / 跳数变化时恢复该焦点的会话内探索状态
  useEffect(() => {
    if (!sessionKey || hydratedKey === sessionKey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(readSession(sessionKey) ?? freshSession());
    setHydratedKey(sessionKey);
    setSelectedNodeId(null);
  }, [sessionKey, hydratedKey]);

  // 仅在当前 key 已完成恢复后才写回，避免用初始空状态覆盖已持久化的探索结果
  useEffect(() => {
    if (!sessionKey || hydratedKey !== sessionKey) return;
    writeSession(sessionKey, session);
  }, [sessionKey, hydratedKey, session]);

  const activeExpansions = useMemo(
    () =>
      Object.entries(session.expansions)
        .filter(([id]) => !session.collapsedIds.includes(id))
        .map(([, view]) => view),
    [session.expansions, session.collapsedIds],
  );

  const view = useMemo(() => {
    const merged = base.data ? mergeGraphViews(base.data, activeExpansions) : EMPTY_VIEW;
    return applyGraphFilters(merged, session.filters);
  }, [base.data, activeExpansions, session.filters]);

  const isExpanded = useCallback(
    (id: string) =>
      Boolean(session.expansions[id]) && !session.collapsedIds.includes(id),
    [session.expansions, session.collapsedIds],
  );

  const isCollapsed = useCallback((id: string) => session.collapsedIds.includes(id), [session.collapsedIds]);

  const collapse = useCallback((id: string) => {
    setSession((prev) =>
      prev.collapsedIds.includes(id) ? prev : { ...prev, collapsedIds: [...prev.collapsedIds, id] },
    );
  }, []);

  const toggleExpand = useCallback(
    (id: string) => {
      if (session.expansions[id]) {
        // 已展开 → 折叠；已折叠 → 恢复显示，均不重新请求
        setSession((prev) => ({
          ...prev,
          collapsedIds: prev.collapsedIds.includes(id)
            ? prev.collapsedIds.filter((item) => item !== id)
            : [...prev.collapsedIds, id],
        }));
        return;
      }

      setExpandingId(id);
      void fetchNeighborhood({ entity: id, maxHops: 1, datasetIds: input.datasetIds, limit: 60 })
        .then((result) => {
          setSession((prev) => ({
            ...prev,
            expansions: { ...prev.expansions, [id]: result },
            collapsedIds: prev.collapsedIds.filter((item) => item !== id),
          }));
        })
        .finally(() => setExpandingId(null));
    },
    [session.expansions, input.datasetIds],
  );

  const setFilters = useCallback((filters: GraphFilters) => {
    setSession((prev) => ({ ...prev, filters }));
  }, []);

  const selectedNode = useMemo(
    () => view.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [view.nodes, selectedNodeId],
  );

  const selectedEdges = useMemo(
    () => (selectedNodeId ? incidentEdges(view, selectedNodeId) : []),
    [view, selectedNodeId],
  );

  return {
    view,
    focus,
    isLoading: base.isLoading,
    isError: base.isError,
    refetch: () => void base.refetch(),
    selectedNode,
    selectedEdges,
    selectNode: setSelectedNodeId,
    isExpanded,
    isCollapsed,
    expandingId,
    toggleExpand,
    collapse,
    filters: session.filters,
    setFilters,
  };
}
