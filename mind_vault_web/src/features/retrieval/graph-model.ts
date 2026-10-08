import type { EntityType, GraphEdge, GraphNode, GraphView, RelationType } from '@/types/domain';

/** 画布规模上限：超出即截断并提示用过滤缩小范围（见设计方案 4.3.4）。 */
export const GRAPH_NODE_CAP = 300;
export const GRAPH_EDGE_CAP = 600;

export interface GraphFilters {
  entityTypes: EntityType[];
  relationTypes: RelationType[];
}

/** 空过滤表示「不过滤」，与后端缺省语义一致。 */
export function emptyGraphFilters(): GraphFilters {
  return { entityTypes: [], relationTypes: [] };
}

/** 按当前子图重算度数：过滤或折叠后 degree 必须反映可见边数。 */
function recomputeDegree(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (edge.target !== edge.source) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return nodes.map((node) => ({ ...node, degree: degree.get(node.id) ?? 0 }));
}

/** 合并别名：展开回来的节点可能带出基础图没有的别名，去重后并集 */
function mergeAliases(a?: string[], b?: string[]): string[] | undefined {
  const merged = [...new Set([...(a ?? []), ...(b ?? [])])];
  return merged.length > 0 ? merged : undefined;
}

/**
 * 合并基础图与各次展开的邻域：节点按 id 去重、边按 id 去重，
 * 焦点节点优先保留，超出上限则截断并标记 `truncated`。
 */
export function mergeGraphViews(base: GraphView, expansions: GraphView[]): GraphView {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  for (const view of [base, ...expansions]) {
    for (const node of view.nodes) {
      const existing = nodeMap.get(node.id);
      if (!existing) {
        nodeMap.set(node.id, node);
        continue;
      }
      const aliases = mergeAliases(existing.aliases, node.aliases);
      if ((node.isFocus && !existing.isFocus) || aliases !== existing.aliases) {
        nodeMap.set(node.id, {
          ...existing,
          isFocus: existing.isFocus || Boolean(node.isFocus),
          aliases,
        });
      }
    }
    for (const edge of view.edges) {
      if (!edgeMap.has(edge.id)) edgeMap.set(edge.id, edge);
    }
  }

  const ordered = [...nodeMap.values()].sort(
    (a, b) => Number(Boolean(b.isFocus)) - Number(Boolean(a.isFocus)),
  );
  const keptNodes = ordered.slice(0, GRAPH_NODE_CAP);
  const keptIds = new Set(keptNodes.map((node) => node.id));
  // 丢弃端点缺失的悬空边，避免画布上出现无宿主连线
  const keptEdges = [...edgeMap.values()]
    .filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target))
    .slice(0, GRAPH_EDGE_CAP);

  return {
    focus: base.focus,
    nodes: recomputeDegree(keptNodes, keptEdges),
    edges: keptEdges,
    truncated: base.truncated || keptNodes.length < nodeMap.size || keptEdges.length < edgeMap.size,
  };
}

/** 类型过滤只在前端生效，不重新请求后端。 */
export function applyGraphFilters(view: GraphView, filters: GraphFilters): GraphView {
  const entityTypes = new Set(filters.entityTypes);
  const relationTypes = new Set(filters.relationTypes);

  const nodes = entityTypes.size ? view.nodes.filter((node) => entityTypes.has(node.type)) : view.nodes;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = view.edges.filter(
    (edge) =>
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target) &&
      (relationTypes.size === 0 || relationTypes.has(edge.type)),
  );

  return { ...view, nodes: recomputeDegree(nodes, edges), edges };
}

/** 某个节点的关联关系（用于节点详情面板）。 */
export function incidentEdges(view: GraphView, nodeId: string): GraphEdge[] {
  return view.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
}
