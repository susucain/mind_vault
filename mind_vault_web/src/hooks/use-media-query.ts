import { useCallback, useSyncExternalStore } from 'react';

/** jsdom 未实现 matchMedia，缺失时统一视为不匹配（桌面布局）。 */
function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/** 订阅媒体查询：用于在桌面两栏与紧凑抽屉之间切换图谱呈现（见设计方案 4.5.4）。 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => matches(query), [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
