export interface LayoutNodeInput {
  id: string;
}

export interface LayoutEdgeInput {
  source: string;
  target: string;
}

export interface LayoutInput {
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  width: number;
  height: number;
}

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutResult {
  positions: Record<string, LayoutPosition>;
}

/** 无 Worker 环境（jsdom 测试）下的确定性环形布局兜底。 */
function fallbackLayout(input: LayoutInput): LayoutResult {
  const { nodes, width, height } = input;
  const positions: Record<string, LayoutPosition> = {};
  const radius = Math.max(60, Math.min(width, height) / 2 - 48);
  nodes.forEach((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
    positions[node.id] = {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    };
  });
  return { positions };
}

/**
 * 力导向布局在 Web Worker 中计算，主线程只负责渲染（见设计方案 4.3.4）。
 * Worker 不可用或出错时回退到环形布局，保证画布始终可用。
 */
export function computeGraphLayout(input: LayoutInput): Promise<LayoutResult> {
  if (input.nodes.length === 0) return Promise.resolve({ positions: {} });
  if (typeof Worker === 'undefined') return Promise.resolve(fallbackLayout(input));

  return new Promise<LayoutResult>((resolve) => {
    let settled = false;
    const finish = (result: LayoutResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const worker = new Worker(new URL('./graph.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<LayoutResult>) => {
      worker.terminate();
      finish(event.data);
    };
    worker.onerror = () => {
      worker.terminate();
      finish(fallbackLayout(input));
    };
    worker.postMessage(input);
  });
}
