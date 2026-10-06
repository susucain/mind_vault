import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemories, deleteMemory, getMemoryStats, listMemories } from '../../../api/memories';
import type { Memory, MemoryStats } from '../../../api/memories';
import { MemorySection } from './MemorySection';

vi.mock('../../../api/memories', () => ({
  clearMemories: vi.fn(),
  createMemory: vi.fn(),
  deleteMemory: vi.fn(),
  getMemoryStats: vi.fn(),
  listMemories: vi.fn(),
  updateMemory: vi.fn(),
}));

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'm1',
    content: '偏好用 TypeScript 写后端',
    kind: 'preference',
    status: 'ACTIVE',
    hitCount: 3,
    lastUsedAt: null,
    sourceConversationId: null,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

function makeStats(overrides: Partial<MemoryStats> = {}): MemoryStats {
  return {
    active: 3,
    superseded: 2,
    total: 5,
    byKind: { preference: 1, fact: 1, goal: 1 },
    hitTotal: 9,
    maxActive: 200,
    atCapacity: false,
    ...overrides,
  };
}

function renderSection(items: Memory[] = [], stats: Partial<MemoryStats> = {}) {
  vi.mocked(listMemories).mockResolvedValue({ items, total: items.length, page: 1, pageSize: null });
  vi.mocked(getMemoryStats).mockResolvedValue(makeStats(stats));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemorySection />
    </QueryClientProvider>,
  );
}

describe('MemorySection', () => {
  beforeEach(() => {
    vi.mocked(listMemories).mockReset();
    vi.mocked(getMemoryStats).mockReset();
    vi.mocked(deleteMemory).mockReset();
    vi.mocked(clearMemories).mockReset();
  });

  it('shows the loading state first and then renders the memory list with counts', async () => {
    renderSection([makeMemory()]);

    expect(screen.getByLabelText('加载记忆')).toBeInTheDocument();

    expect(await screen.findByText('偏好用 TypeScript 写后端')).toBeInTheDocument();
    expect(screen.getByText('命中 3 次')).toBeInTheDocument();
    expect(screen.getByText('偏好用 TypeScript 写后端').closest('.memory-card')).toHaveTextContent('偏好');
    expect(screen.getByRole('button', { name: /生效中/ })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /已失效/ })).toHaveTextContent('2');
  });

  it('differentiates an empty active list from an empty superseded list', async () => {
    renderSection();

    expect(await screen.findByRole('heading', { name: '还没有长期记忆' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /已失效/ }));

    expect(await screen.findByRole('heading', { name: '没有被取代的记忆' })).toBeInTheDocument();
  });

  it('sends the debounced keyword together with the status filter', async () => {
    renderSection();

    await screen.findByRole('heading', { name: '还没有长期记忆' });
    fireEvent.change(screen.getByLabelText('搜索记忆'), { target: { value: '缓存' } });

    await waitFor(() =>
      expect(listMemories).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE', q: '缓存' })),
    );
    expect(await screen.findByRole('heading', { name: '没有匹配的记忆' })).toBeInTheDocument();
  });

  it('stacks the kind filter on top of the status filter', async () => {
    renderSection();

    await screen.findByRole('heading', { name: '还没有长期记忆' });

    fireEvent.click(screen.getByRole('button', { name: '目标' }));
    await waitFor(() =>
      expect(listMemories).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'ACTIVE', kind: 'goal' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /已失效/ }));
    await waitFor(() =>
      expect(listMemories).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'SUPERSEDED', kind: 'goal' }),
      ),
    );
  });

  it('asks for confirmation before deleting a memory', async () => {
    vi.mocked(deleteMemory).mockResolvedValue({ id: 'm1', deleted: true });
    renderSection([makeMemory()]);

    fireEvent.click(await screen.findByRole('button', { name: '删除' }));

    expect(await screen.findByRole('heading', { name: '删除这条记忆' })).toBeInTheDocument();
    expect(deleteMemory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(deleteMemory).toHaveBeenCalledWith('m1'));
    expect(await screen.findByText('已删除该条记忆')).toBeInTheDocument();
  });

  it('requires typing the confirmation text before clearing everything', async () => {
    vi.mocked(clearMemories).mockResolvedValue({ deleted: 5 });
    renderSection([makeMemory()]);

    fireEvent.click(await screen.findByRole('button', { name: '清空记忆' }));

    const confirm = await screen.findByRole('button', { name: '确认清空' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('请输入「清空」以确认'), { target: { value: '清空' } });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    await waitFor(() => expect(clearMemories).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('已清空 5 条记忆')).toBeInTheDocument();
  });

  it('hides the capacity notice while there is still room', async () => {
    renderSection([], { atCapacity: false });

    await screen.findByRole('heading', { name: '还没有长期记忆' });

    expect(screen.queryByText('长期记忆已达上限')).not.toBeInTheDocument();
  });

  it('explains the eviction rule and jumps to the superseded list when full', async () => {
    renderSection([], { atCapacity: true });

    expect(await screen.findByText('长期记忆已达上限')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看已失效' }));

    await waitFor(() =>
      expect(listMemories).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'SUPERSEDED' })),
    );
  });
});