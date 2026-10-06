import { useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import type { SearchHistoryEntry } from '@/types/domain';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/ui/popover';
import { MODE_LABELS } from '../mode-meta';

interface HistoryPopoverProps {
  entries: SearchHistoryEntry[];
  isLoading: boolean;
  onSelect: (entry: SearchHistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  clearing?: boolean;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** 检索历史（服务端存储、按用户隔离）：点击条目回填全部条件并重新检索。 */
export function HistoryPopover({ entries, isLoading, onSelect, onDelete, onClear, clearing }: HistoryPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label="检索历史"
          className={cn('button', 'button--secondary')}
          type="button"
        >
          <History aria-hidden="true" size={15} />
          检索历史
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="history-popover__header">
          <span>最近检索</span>
          <button
            className="history-popover__clear"
            disabled={clearing || entries.length === 0}
            onClick={onClear}
            type="button"
          >
            清空
          </button>
        </div>
        <div className="history-popover__body">
          {isLoading ? (
            <p className="history-popover__empty">加载中…</p>
          ) : entries.length === 0 ? (
            <p className="history-popover__empty">暂无检索历史</p>
          ) : (
            <ul className="history-popover__list">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    className="history-popover__item"
                    onClick={() => {
                      onSelect(entry);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="history-popover__item-top">
                      <span className="history-popover__mode">{MODE_LABELS[entry.mode]}</span>
                      <span className="history-popover__query">{entry.query}</span>
                    </span>
                    <span className="history-popover__meta">
                      {entry.resultCount} 条 · {formatTime(entry.createdAt)}
                    </span>
                  </button>
                  <button
                    aria-label={`删除检索历史 ${entry.query}`}
                    className="history-popover__delete"
                    onClick={() => onDelete(entry.id)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
