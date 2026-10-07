import { useEffect, useRef } from 'react';

/** 距底部多少像素以内算「贴在底部」 */
const BOTTOM_THRESHOLD = 80;

/**
 * 粘底滚动：只有当用户本就贴近底部时才跟随新内容；
 * 用户上滑阅读时不会被强制拉回（web 端阅读长回答的常见诉求）。
 * `animate` 为 false 时用瞬时滚动——流式增量每帧都在长高，
 * 平滑动画会互相打断反而显得卡顿。
 */
export function useStickyScroll(signal: string, animate: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      stick.current = node.scrollHeight - node.scrollTop - node.clientHeight <= BOTTOM_THRESHOLD;
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    return () => node.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || !stick.current) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = animate && !reduced ? 'smooth' : 'auto';
    // jsdom 等无 scrollTo 的环境退化为直接赋值
    if (typeof node.scrollTo === 'function') node.scrollTo({ top: node.scrollHeight, behavior });
    else node.scrollTop = node.scrollHeight;
  }, [signal, animate]);

  return ref;
}