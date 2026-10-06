import { useEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import type { SearchResultItem } from '@/types/domain';
import { ResultCard } from './ResultCard';

interface ResultListProps {
  items: SearchResultItem[];
  hasNext: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/** 结果列表：触底自动加载下一页，并保留「加载更多」按钮作为兜底。 */
export function ResultList({ items, hasNext, isFetchingNextPage, onLoadMore }: ResultListProps) {
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNext || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) onLoadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNext, isFetchingNextPage, onLoadMore]);

  return (
    <div className="retrieval-results">
      <ul className="retrieval-results__list">
        {items.map((item) => (
          <li key={item.chunkId}>
            <ResultCard item={item} />
          </li>
        ))}
      </ul>
      {hasNext ? (
        <div className="retrieval-results__more" ref={sentinel}>
          <Button disabled={isFetchingNextPage} onClick={onLoadMore} type="button" variant="secondary">
            {isFetchingNextPage ? (
              <>
                <LoaderCircle aria-hidden="true" size={15} />
                加载中…
              </>
            ) : (
              '加载更多'
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
