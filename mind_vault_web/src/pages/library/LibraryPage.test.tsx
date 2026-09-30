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

  it('uses supported server filters and hides unsupported real-mode controls', async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      items: [
        { id: '1', title: 'React 指南', status: 1, sourceFileExtension: 'pdf' },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    renderPage();

    expect(await screen.findByText('React 指南')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索文件' }), 'React');
    await waitFor(() => expect(listDocuments).toHaveBeenLastCalledWith({
      datasetId: undefined,
      page: 1,
      pageSize: 10,
      title: 'React',
    }));
    expect(screen.getByText('最近添加')).toBeInTheDocument();
    expect(screen.queryByLabelText('文件状态')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('文件类型')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('文件排序')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '选择 React 指南' })).not.toBeInTheDocument();
  });

  it('pages through the server result', async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      items: [{ id: '11', title: '第十一份资料', status: 1 }],
      page: 1,
      pageSize: 10,
      total: 21,
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '下一页' }));

    await waitFor(() => expect(listDocuments).toHaveBeenLastCalledWith({
      datasetId: undefined,
      page: 2,
      pageSize: 10,
      title: undefined,
    }));
    expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument();
  });

  it('shows a retry action after the document query fails', async () => {
    vi.mocked(listDocuments)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 10, total: 0 });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '重试' }));

    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('还没有文件')).toBeInTheDocument();
  });
});
