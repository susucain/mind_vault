import { useState } from 'react';
import { Check, ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input, LoadingState, StatusBadge } from '../../../components/ui';
import type { ReviewItemRecord } from '../../../api/interview';
import { filterReviewItems, type ReviewFilter } from './review-items';

export function ReviewItemsPanel({
  items,
  loading = false,
  status = 'PENDING',
  onStatusChange,
  onMaster,
}: {
  items: ReviewItemRecord[];
  loading?: boolean;
  status?: ReviewFilter;
  onStatusChange?: (status: ReviewFilter) => void;
  onMaster?: (item: ReviewItemRecord) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = filterReviewItems(items, { status, search });
  return (
    <div className="review-workspace">
      <div className="review-toolbar">
        <div className="review-search"><Search aria-hidden="true" size={16} /><Input aria-label="搜索复习项" onChange={(event) => setSearch(event.target.value)} placeholder="搜索主题或薄弱点" value={search} /></div>
        <div aria-label="复习状态筛选" className="segmented-control">
          {(['PENDING', 'COMPLETED', 'ALL'] as const).map((value) => <button aria-pressed={status === value} key={value} onClick={() => onStatusChange?.(value)} type="button">{value === 'PENDING' ? '待复习' : value === 'COMPLETED' ? '已掌握' : '全部'}</button>)}
        </div>
      </div>
      {loading ? <LoadingState label="加载复习项" /> : filtered.length === 0 ? <p className="widget-empty">没有符合条件的复习项。</p> : (
        <div className="review-items-list">
          {filtered.map((item) => <article className="review-item-row" key={item.id}>
            <div className="review-item-copy"><div><strong>{item.title || '未命名复习项'}</strong><StatusBadge tone={item.status === 'COMPLETED' ? 'success' : 'warning'}>{item.status === 'COMPLETED' ? '已掌握' : '待复习'}</StatusBadge></div><p>{item.reason || '回顾原回答并补充关键依据。'}</p></div>
            <div className="review-item-actions"><Link aria-label={`查看${item.title || '复习项'}`} className="icon-button" to={`/app/interview/review-items/${item.id}`}><ChevronRight size={17} /></Link>{item.status !== 'COMPLETED' && onMaster ? <button aria-label={`标记${item.title || '复习项'}已掌握`} className="icon-button" onClick={() => onMaster(item)} type="button"><Check size={16} /></button> : null}</div>
          </article>)}
        </div>
      )}
    </div>
  );
}
