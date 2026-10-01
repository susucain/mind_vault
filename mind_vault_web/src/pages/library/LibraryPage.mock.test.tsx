import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { archiveDocument } from '../../api/documents';
import { LibraryPage } from './LibraryPage';

vi.mock('../../lib/config', () => ({ appConfig: { enableMockApi: true } }));
vi.mock('../../api/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documents')>();
  return { ...actual, archiveDocument: vi.fn().mockResolvedValue(undefined) };
});

describe('LibraryPage mock capabilities', () => {
  it('keeps full filters and executes batch archive actions', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><LibraryPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('React 性能优化手册')).toBeInTheDocument();
    expect(screen.getByLabelText('文件状态')).toBeInTheDocument();
    expect(screen.getByLabelText('文件类型')).toBeInTheDocument();
    expect(screen.getByLabelText('文件排序')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: '选择 React 性能优化手册' }));
    await userEvent.click(screen.getByRole('button', { name: '批量操作' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '归档' }));

    await waitFor(() => expect(archiveDocument).toHaveBeenCalledWith(
      'mock-1',
      expect.objectContaining({ title: 'React 性能优化手册' }),
    ));
    expect(screen.queryByText('React 性能优化手册')).not.toBeInTheDocument();
  });
});
