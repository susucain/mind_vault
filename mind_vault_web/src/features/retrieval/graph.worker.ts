import { forceCenter, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { LayoutInput, LayoutResult } from './graph-layout';

interface WorkerContext {
  onmessage: ((event: MessageEvent<LayoutInput>) => void) | null;
  postMessage: (result: LayoutResult) => void;
}

const ctx = self as unknown as WorkerContext;

/** 固定迭代次数后即停止，不做持续动画（见设计方案 4.3.4 性能策略）。 */
const TICKS = 300;

/** 归一化后预留的边距，避免节点贴在画布边缘。 */
const PADDING = 32;

ctx.onmessage = (event: MessageEvent<LayoutInput>) => {
  const { nodes, edges, width, height } = event.data;
  const simNodes = nodes.map((node) => ({ id: node.id, x: width / 2, y: height / 2 }));
  const indexById = new Map(simNodes.map((node, index) => [node.id, index]));
  const links = edges
    .map((edge) => ({ source: indexById.get(edge.source), target: indexById.get(edge.target) }))
    .filter(
      (link): link is { source: number; target: number } =>
        link.source !== undefined && link.target !== undefined,
    );

  const simulation = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(-260))
    .force('link', forceLink(links).distance(96).strength(0.5))
    .force('center', forceCenter(width / 2, height / 2))
    .force('x', forceX(width / 2).strength(0.03))
    .force('y', forceY(height / 2).strength(0.03))
    .stop();

  simulation.tick(TICKS);

  const positions: LayoutResult['positions'] = {};

  // 力导向布局的展开范围随节点数增长：大图会撑出画布数倍，导致节点落在可视区外。
  // 这里仅在超出容器时按比例缩小并居中，保证任意规模在初始视口下都能看到节点（见设计方案 4.3.4）。
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of simNodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const spreadX = Math.max(maxX - minX, 1);
  const spreadY = Math.max(maxY - minY, 1);
  const scale = Math.min(1, (width - PADDING * 2) / spreadX, (height - PADDING * 2) / spreadY);
  const offsetX = (width - spreadX * scale) / 2 - minX * scale;
  const offsetY = (height - spreadY * scale) / 2 - minY * scale;

  for (const node of simNodes) {
    positions[node.id] = {
      x: (node.x ?? 0) * scale + offsetX,
      y: (node.y ?? 0) * scale + offsetY,
    };
  }
  ctx.postMessage({ positions });
};
