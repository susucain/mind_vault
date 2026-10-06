import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SearchHistoryEntry } from '@/types/domain';
import { HistoryPopover } from './HistoryPopover';

const entry: SearchHistoryEntry = {
  id: 'h1',
  mode: 'vector',
  query: '向量检索',
  datasetIds: ['d1'],
  entityNames: [],
  filters: { sort: 'relevance', from: null, to: null, pageSize: 10, maxHops: 1 },
  resultCount: 8,
  createdAt: '2026-10-04T12:00:00.000Z',
};

function setup(overrides: Partial<Parameters<typeof HistoryPopover>[0]> = {}) {
  const props = {
    entries: [entry],
    isLoading: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<HistoryPopover {...props} />);
  return props;
}

describe('HistoryPopover', () => {
  it('backfills the full query when an entry is selected', async () => {
    const props = setup();

    await userEvent.click(screen.getByRole('button', { name: '检索历史' }));
    await userEvent.click(await screen.findByRole('button', { name: /语义/ }));

    expect(props.onSelect).toHaveBeenCalledWith(entry);
  });

  it('deletes a single entry and clears the whole history', async () => {
    const props = setup();

    await userEvent.click(screen.getByRole('button', { name: '检索历史' }));
    await userEvent.click(await screen.findByRole('button', { name: '删除检索历史 向量检索' }));
    expect(props.onDelete).toHaveBeenCalledWith('h1');

    await userEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(props.onClear).toHaveBeenCalled();
  });

  it('shows an empty hint when there is no history', async () => {
    setup({ entries: [] });

    await userEvent.click(screen.getByRole('button', { name: '检索历史' }));
    expect(await screen.findByText('暂无检索历史')).toBeInTheDocument();
  });
});
