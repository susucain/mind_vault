import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listDocuments } from '../../api/documents';
import { listDatasets } from '../../api/datasets';
import { LibraryPage } from './LibraryPage';

vi.mock('../../api/documents', () => ({ listDocuments: vi.fn() }));
vi.mock('../../api/datasets', () => ({ listDatasets: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><LibraryPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.mocked(listDocuments).mockReset();
    vi.mocked(listDatasets).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
  });

  it('filters files by search, status and type', async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      items: [
        { id: '1', title: 'React 指南', status: 1, sourceFileExtension: 'pdf' },
        { id: '2', title: '接口记录', status: 0, sourceFileExtension: 'md' },
      ],
      page: 1,
      pageSize: 100,
      total: 2,
    });
    renderPage();

    expect(await screen.findByText('React 指南')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索文件' }), '接口');
    expect(screen.queryByText('React 指南')).not.toBeInTheDocument();
    expect(screen.getByText('接口记录')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('文件状态'), 'ready');
    expect(screen.getByText('没有匹配的文件')).toBeInTheDocument();
  });

  it('shows a retry action after the document query fails', async () => {
    vi.mocked(listDocuments)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 100, total: 0 });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '重试' }));

    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('还没有文件')).toBeInTheDocument();
  });
});
