import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Search, Trash2 } from 'lucide-react';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '../../../components/ui';
import type { Memory, MemoryKind, MemoryStatus } from '../../../api/memories';
import {
  useClearMemories,
  useCreateMemory,
  useDeleteMemory,
  useMemories,
  useMemoryStats,
  useUpdateMemory,
} from '../../../features/settings/queries';
import { describeProfileError, MEMORY_KIND_LABEL, MEMORY_KIND_ORDER } from '../../../features/settings/settings-labels';
import { DangerConfirmDialog } from '../components/DangerConfirmDialog';
import { MemoryCard } from '../components/MemoryCard';
import { MemoryEditorDialog } from '../components/MemoryEditorDialog';
import type { MemoryDraft } from '../components/MemoryEditorDialog';

/** 与 ChatPage / retrieval queries 同一口径：输入停顿 300ms 才发请求 */
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

type KindFilter = MemoryKind | 'ALL';

export function MemorySection() {
  const [status, setStatus] = useState<MemoryStatus>('ACTIVE');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const keyword = useDebouncedValue(searchInput.trim());

  const [editor, setEditor] = useState<{ memory?: Memory } | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const memoriesQuery = useMemories({
    status,
    kind: kind === 'ALL' ? undefined : kind,
    q: keyword || undefined,
  });
  const statsQuery = useMemoryStats();
  const createMemory = useCreateMemory();
  const updateMemory = useUpdateMemory();
  const deleteMemory = useDeleteMemory();
  const clearMemories = useClearMemories();

  const items = memoriesQuery.data?.items ?? [];
  const stats = statsQuery.data;
  const atCapacity = stats?.atCapacity ?? false;
  const filtered = kind !== 'ALL' || Boolean(keyword);
  const refreshing = memoriesQuery.isFetching && !memoriesQuery.isPending;

  function submitEditor(draft: MemoryDraft) {
    setEditorError(null);

    if (editor?.memory) {
      updateMemory.mutate(
        { id: editor.memory.id, patch: { content: draft.content, kind: draft.kind } },
        {
          onSuccess: () => {
            setEditor(null);
            setFeedback('已更新这条记忆');
          },
          onError: (error) => setEditorError(describeProfileError(error)),
        },
      );
      return;
    }

    createMemory.mutate(draft, {
      onSuccess: () => {
        setEditor(null);
        setFeedback('已新增一条记忆');
      },
      onError: (error) => setEditorError(describeProfileError(error)),
    });
  }

  function restore(memory: Memory) {
    updateMemory.mutate(
      { id: memory.id, patch: { status: 'ACTIVE' } },
      {
        onSuccess: () =>
          setFeedback(
            atCapacity
              ? '已恢复为生效中；记忆已满，最久未使用的一条会被自动淘汰'
              : '已恢复为生效中',
          ),
        onError: (error) => setActionError(describeProfileError(error)),
      },
    );
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMemory.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setFeedback('已删除该条记忆');
      },
      onError: (error) => {
        setDeleteTarget(null);
        setActionError(describeProfileError(error));
      },
    });
  }

  function confirmClear() {
    clearMemories.mutate(undefined, {
      onSuccess: (result) => {
        setClearOpen(false);
        setFeedback(`已清空 ${result.deleted} 条记忆`);
      },
      onError: (error) => {
        setClearOpen(false);
        setActionError(describeProfileError(error));
      },
    });
  }

  /** 空态文案必须区分「筛没了」和「本来就没有」，否则用户会以为记忆丢了 */
  function emptyCopy() {
    if (filtered) {
      return { title: '没有匹配的记忆', description: '换个关键词或类型再试试。' };
    }
    if (status === 'SUPERSEDED') {
      return {
        title: '没有被取代的记忆',
        description: '同类偏好更新后，旧条目会被标记为已失效并留在这里。',
      };
    }
    return { title: '还没有长期记忆', description: '对话中被记住的偏好、事实和目标会出现在这里。' };
  }

  return (
    <section className="settings-panel">
      <div className="section-heading">
        <h2>长期记忆</h2>
        <div className="memory-status" role="group" aria-label="按状态筛选">
          <button
            aria-pressed={status === 'ACTIVE'}
            className="memory-status__chip"
            onClick={() => setStatus('ACTIVE')}
            type="button"
          >
            生效中 <strong>{stats?.active ?? 0}</strong>
          </button>
          <button
            aria-pressed={status === 'SUPERSEDED'}
            className="memory-status__chip"
            onClick={() => setStatus('SUPERSEDED')}
            type="button"
          >
            已失效 <strong>{stats?.superseded ?? 0}</strong>
          </button>
        </div>
      </div>

      <p className="muted">
        记忆只用于理解你的偏好和目标，会随每轮提问交给模型，不会被当作资料引用。
      </p>

      {atCapacity ? (
        <div className="capability-notice memory-capacity" role="status">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>长期记忆已达上限</strong>
            <span>新增记忆时会自动淘汰最久未使用的一条旧记忆。</span>
            <Button onClick={() => setStatus('SUPERSEDED')} type="button" variant="secondary">
              查看已失效
            </Button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p className="settings-feedback" role="status">
          {feedback}
        </p>
      ) : null}
      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="memory-toolbar">
        <div className="memory-search">
          <Search aria-hidden="true" size={15} />
          <Input
            aria-label="搜索记忆"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜索记忆内容"
            value={searchInput}
          />
        </div>

        <div className="memory-filters" role="group" aria-label="按类型筛选">
          <button
            aria-pressed={kind === 'ALL'}
            className="memory-chip"
            onClick={() => setKind('ALL')}
            type="button"
          >
            全部
          </button>
          {MEMORY_KIND_ORDER.map((option) => (
            <button
              aria-pressed={kind === option}
              className="memory-chip"
              key={option}
              onClick={() => setKind(option)}
              type="button"
            >
              {MEMORY_KIND_LABEL[option]}
            </button>
          ))}
        </div>

        <Button
          onClick={() => {
            setEditorError(null);
            setEditor({});
          }}
          type="button"
        >
          <Plus size={15} />
          新增记忆
        </Button>
      </div>

      {refreshing ? (
        <div aria-label="正在刷新记忆列表" className="memory-progress" role="progressbar" />
      ) : null}

      {memoriesQuery.isPending ? (
        <LoadingState label="加载记忆" />
      ) : memoriesQuery.isError ? (
        <ErrorState onRetry={() => void memoriesQuery.refetch()} title="记忆加载失败" />
      ) : items.length ? (
        <div className="memory-list">
          {items.map((memory) => (
            <MemoryCard
              busy={updateMemory.isPending || deleteMemory.isPending}
              key={memory.id}
              memory={memory}
              onDelete={setDeleteTarget}
              onEdit={(target) => {
                setEditorError(null);
                setEditor({ memory: target });
              }}
              onRestore={restore}
            />
          ))}
        </div>
      ) : (
        <EmptyState {...emptyCopy()} />
      )}

      <div className="danger-zone">
        <div>
          <strong>清空全部记忆</strong>
          <p className="muted">删除所有长期记忆，包含已失效的条目。此操作不可恢复。</p>
        </div>
        <Button
          className="button--danger"
          disabled={(stats?.total ?? 1) === 0}
          onClick={() => setClearOpen(true)}
          type="button"
          variant="secondary"
        >
          <Trash2 size={15} />
          清空记忆
        </Button>
      </div>

      {editor ? (
        <MemoryEditorDialog
          error={editorError}
          initial={editor.memory}
          key={editor.memory?.id ?? 'new'}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onSubmit={submitEditor}
          open
          pending={createMemory.isPending || updateMemory.isPending}
        />
      ) : null}

      {deleteTarget ? (
        <DangerConfirmDialog
          confirmLabel="确认删除"
          description="删除后这条记忆不会再被参考，也无法恢复。"
          onConfirm={confirmDelete}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          open
          pending={deleteMemory.isPending}
          title="删除这条记忆"
        />
      ) : null}

      {clearOpen ? (
        <DangerConfirmDialog
          confirmLabel="确认清空"
          description={`将删除全部 ${stats?.total ?? 0} 条记忆，包含已失效的条目，且无法恢复。`}
          onConfirm={confirmClear}
          onOpenChange={(open) => {
            if (!open) setClearOpen(false);
          }}
          open
          pending={clearMemories.isPending}
          requireText="清空"
          title="清空全部记忆"
        />
      ) : null}
    </section>
  );
}