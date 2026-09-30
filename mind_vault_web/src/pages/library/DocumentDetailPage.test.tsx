import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocument, getDocumentStatus } from '../../api/documents';
import { DocumentDetailPage } from './DocumentDetailPage';

vi.mock('../../api/documents', () => ({
  getDocument: vi.fn(),
  getDocumentStatus: vi.fn(),
}));

describe('DocumentDetailPage backend status contract', () => {
  beforeEach(() => {
    vi.mocked(getDocument).mockResolvedValue({
      id: 'doc-1',
      title: '真实文档',
      status: 0,
      sections: [],
    });
    vi.mocked(getDocumentStatus).mockResolvedValue({
      documentId: 'doc-1',
      jobId: 'job-1',
      status: 'CHUNKING',
      currentStage: 'chunking',
      errorMessage: null,
      stageProgress: { completed: 3, total: 10, percent: 30 },
    });
  });

  it('queries detail and status independently and renders the exact current stage', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/app/library/documents/doc-1']}>
          <Routes><Route path="/app/library/documents/:documentId" element={<DocumentDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: '真实文档' })).toBeInTheDocument();
    expect(screen.getByText('chunking')).toBeInTheDocument();
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(getDocument).toHaveBeenCalledWith('doc-1');
    expect(getDocumentStatus).toHaveBeenCalledWith('doc-1');
    expect(screen.queryByText('向量索引')).not.toBeInTheDocument();
  });
});
