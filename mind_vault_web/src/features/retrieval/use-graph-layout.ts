import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphView } from '@/types/domain';
import { computeGraphLayout, type LayoutPosition } from './graph-layout';

/** 超过该时长布局仍未返回则提示可缩小范围（见设计方案 4.4.3）。 */
const SLOW_LAYOUT_MS = 1500;

export interface GraphLayout {
  /** 回调 ref：画布可能按需挂载（如折叠区块展开时才出现），用对象 ref 会错过挂载时机 */
  canvasRef: (node: HTMLDivElement | null) => void;
  positions: Record<string, LayoutPosition>;
  /** 位置尚未对应当前节点/边集合 */
  pending: boolean;
  /** 长时间未返回，可提示用户缩小范围 */
  slow: boolean;
}

/**
 * 力导向布局：节点/边集合或画布尺寸变化（检索、展开、折叠、过滤、窗口缩放）都要重算，
 * 否则节点会落在可视区外（见设计方案 4.6.1）。
 * 抽成独立 hook，供检索图谱与「回答相关图谱」共用，避免两处各写一遍布局触发逻辑。
 */
export function useGraphLayout(view: GraphView): GraphLayout {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  // 布局结果与其对应的节点/边指纹：指纹不一致即表示布局仍在计算（避免同步 setState）
  const [layout, setLayout] = useState<{
    key: string;
    positions: Record<string, LayoutPosition>;
  }>({ key: '', positions: {} });
  const [slowKey, setSlowKey] = useState('');

  const canvasRef = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;
    // ResizeObserver 在被 observe 时会立即回调一次，初始尺寸不会漏
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
  }, [element]);

  const layoutKey = useMemo(
    () =>
      `${view.nodes.map((node) => node.id).join(',')}|${view.edges.map((edge) => edge.id).join(',')}` +
      `|${canvasSize ? `${Math.round(canvasSize.width)}x${Math.round(canvasSize.height)}` : ''}`,
    [view.nodes, view.edges, canvasSize],
  );

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
  }, [layoutKey, view.nodes, view.edges, canvasSize]);

  const pending = view.nodes.length > 0 && layout.key !== layoutKey;

  return {
    canvasRef,
    positions: layout.positions,
    pending,
    slow: pending && slowKey === layoutKey,
  };
}