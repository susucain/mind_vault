import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { listArchivedDocuments, restoreArchivedDocument } from '../../api/documents';
import { ArchivePage } from './ArchivePage';

vi.mock('../../lib/config', () => ({ appConfig: { enableMockApi: true } }));
vi.mock('../../api/documents', () => ({
  listArchivedDocuments: vi.fn()
    .mockResolvedValueOnce([{
      id: 'mock-archived-1',
      title: '历史项目总结',
      sourceFileExtension: 'pdf',
      archivedAt: '2026-09-18',
    }])
    .mockResolvedValue([]),
  restoreArchivedDocument: vi.fn().mockResolvedValue(undefined),
}));

describe('ArchivePage', () => {
  it('labels mock data and restores an archived file through the adapter', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><ArchivePage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('模拟数据')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: '恢复 历史项目总结' }));

    expect(listArchivedDocuments).toHaveBeenCalledTimes(2);
    expect(restoreArchivedDocument).toHaveBeenCalledWith('mock-archived-1');
    expect(await screen.findByText('归档中没有文件')).toBeInTheDocument();
  });
});
