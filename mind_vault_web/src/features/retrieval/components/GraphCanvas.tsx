import { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { EntityType, GraphView } from '@/types/domain';
import { cn } from '@/lib/utils';
import { ENTITY_TYPE_COLORS } from '../graph-meta';
import { LOW_CONFIDENCE_THRESHOLD } from '../graph-model';
import type { LayoutPosition } from '../graph-layout';

/** 超过该规模即关闭拖拽、启用可见区渲染与简化节点（见设计方案 4.3.4 性能策略）。 */
export const GRAPH_LITE_THRESHOLD = 150;

interface EntityNodeData extends Record<string, unknown> {
  label: string;
  type: EntityType;
  degree: number;
  simplified: boolean;
}

type EntityNodeType = Node<EntityNodeData, 'entity'>;

function EntityNode({ data, selected }: NodeProps<EntityNodeType>) {
  const size = 12 + Math.min(data.degree, 10) * 1.8;
  return (
    <div className={cn('graph-node', selected && 'graph-node--selected')}>
      <span
        className="graph-node__dot"
        style={{ background: ENTITY_TYPE_COLORS[data.type], height: size, width: size }}
      />
      <span className="graph-node__label">{data.label}</span>
      {data.simplified ? null : <span className="graph-node__degree">{data.degree}</span>}
      <Handle className="graph-node__handle" position={Position.Top} type="target" />
      <Handle className="graph-node__handle" position={Position.Bottom} type="source" />
    </div>
  );
}

const NODE_TYPES = { entity: EntityNode };

/**
 * 布局位置来自 Worker 异步计算：位置就绪前 fitView 会把包围盒算在原点附近，导致节点落在可视区外。
 * 这里在位置集合变化后适配视图，并在节点测量回落后再适配一次（大图逐个测量耗时较长）。
 * 不依赖 `useNodesInitialized`：大图启用 `onlyRenderVisibleElements` 时该标志可能长期为 false。
 * 须作为 `<ReactFlow>` 的子节点渲染以复用其 store 上下文。见设计方案 4.3.4。
 */
function FitViewOnLayout({ positions }: { positions: Record<string, LayoutPosition> }) {
  const { fitView } = useReactFlow();
  const layoutKey = useMemo(() => Object.keys(positions).sort().join(','), [positions]);
  const prevKey = useRef('');
  useEffect(() => {
    if (layoutKey.length === 0 || layoutKey === prevKey.current) return;
    prevKey.current = layoutKey;
    const fit = () => void fitView({ padding: 0.2 });
    let retry = 0;
    const frame = requestAnimationFrame(() => {
      fit();
      retry = window.setTimeout(fit, 400);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, [layoutKey, fitView]);
  return null;
}

interface GraphCanvasProps {
  view: GraphView;
  positions: Record<string, LayoutPosition>;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onExpandNode: (id: string) => void;
}

export function GraphCanvas({ view, positions, selectedNodeId, onSelectNode, onExpandNode }: GraphCanvasProps) {
  const simplified = view.nodes.length > GRAPH_LITE_THRESHOLD;

  const nodes = useMemo<EntityNodeType[]>(
    () =>
      view.nodes.map((node) => ({
        id: node.id,
        type: 'entity',
        position: positions[node.id] ?? { x: 0, y: 0 },
        selected: node.id === selectedNodeId,
        draggable: !simplified,
        data: { label: node.name, type: node.type, degree: node.degree, simplified },
      })),
    [view.nodes, positions, selectedNodeId, simplified],
  );

  const edges = useMemo<Edge[]>(
    () =>
      view.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        style: {
          stroke: 'var(--mv-line-strong)',
          strokeWidth: 1.2,
          ...(edge.confidence !== undefined && edge.confidence < LOW_CONFIDENCE_THRESHOLD
            ? { strokeDasharray: '4 3' }
            : {}),
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--mv-line-strong)' },
      })),
    [view.edges],
  );

  return (
    <ReactFlow
      edges={edges}
      maxZoom={2.5}
      minZoom={0.15}
      nodeTypes={NODE_TYPES}
      nodes={nodes}
      nodesConnectable={false}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onNodeDoubleClick={(_, node) => onExpandNode(node.id)}
      onPaneClick={() => onSelectNode(null)}
      onlyRenderVisibleElements={simplified}
      proOptions={{ hideAttribution: true }}
    >
      <FitViewOnLayout positions={positions} />
      <Background color="var(--mv-line)" gap={22} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
