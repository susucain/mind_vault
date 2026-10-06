import { useEffect, useState } from 'react';
import { sectionDomId } from './document-utils';

/**
 * 滚动联动（scroll-spy）：取视口上部最近的已渲染章节作为当前章节。
 * 传入的 `orders` 需按正序排列，且随翻页追加而变化。
 */
export function useActiveSection(orders: number[]) {
  const [activeOrder, setActiveOrder] = useState<number>();
  const key = orders.join(',');

  useEffect(() => {
    const list = key ? key.split(',').map(Number) : [];
    if (!list.length) return;
    const update = () => {
      const line = window.innerHeight * 0.3;
      let current = list[0];
      for (const order of list) {
        const node = document.getElementById(sectionDomId(order));
        if (!node || node.getBoundingClientRect().top > line) break;
        current = order;
      }
      setActiveOrder((previous) => (previous === current ? previous : current));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [key]);

  return { activeOrder, selectOrder: setActiveOrder };
}
