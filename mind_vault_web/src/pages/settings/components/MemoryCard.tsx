import { Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Button, StatusBadge } from '../../../components/ui';
import type { Memory } from '../../../api/memories';
import {
  MEMORY_KIND_LABEL,
  MEMORY_STATUS_LABEL,
  formatAbsoluteTime,
  formatRelativeTime,
} from '../../../features/settings/settings-labels';

export function MemoryCard({
  busy,
  memory,
  onDelete,
  onEdit,
  onRestore,
}: {
  /** 任一条目在变更中时统一禁用操作，避免并发改同一条 */
  busy: boolean;
  memory: Memory;
  onDelete: (memory: Memory) => void;
  onEdit: (memory: Memory) => void;
  onRestore: (memory: Memory) => void;
}) {
  const superseded = memory.status === 'SUPERSEDED';

  return (
    <article className="memory-card">
      <div className="memory-card__head">
        <StatusBadge tone={superseded ? 'neutral' : 'success'}>{MEMORY_STATUS_LABEL[memory.status]}</StatusBadge>
        <span className="memory-kind-chip">{MEMORY_KIND_LABEL[memory.kind]}</span>
        <div className="memory-card__meta">
          <span>命中 {memory.hitCount} 次</span>
          <time dateTime={memory.createdAt} title={formatAbsoluteTime(memory.createdAt)}>
            {formatRelativeTime(memory.createdAt)}
          </time>
        </div>
      </div>

      <p className="memory-card__content">{memory.content}</p>

      <div className="memory-card__actions">
        {superseded ? (
          <Button disabled={busy} onClick={() => onRestore(memory)} type="button" variant="secondary">
            <RotateCcw size={14} />恢复
          </Button>
        ) : null}
        <Button disabled={busy} onClick={() => onEdit(memory)} type="button" variant="secondary">
          <Pencil size={14} />编辑
        </Button>
        <Button disabled={busy} onClick={() => onDelete(memory)} type="button" variant="ghost">
          <Trash2 size={14} />删除
        </Button>
      </div>
    </article>
  );
}