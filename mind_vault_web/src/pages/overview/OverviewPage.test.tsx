import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listDocuments } from '../../api/documents';
import { listInterviewSessions, listReviewItems } from '../../api/interview';
import { OverviewPage } from './OverviewPage';

vi.mock('../../api/documents', () => ({ listDocuments: vi.fn() }));
vi.mock('../../api/interview', () => ({
  listInterviewSessions: vi.fn(),
  listReviewItems: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><OverviewPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.mocked(listDocuments).mockReset();
    vi.mocked(listInterviewSessions).mockReset();
    vi.mocked(listReviewItems).mockReset();
  });

  it('keeps healthy widgets available when recent documents fail', async () => {
    vi.mocked(listDocuments).mockRejectedValue(new Error('documents unavailable'));
    vi.mocked(listInterviewSessions).mockResolvedValue([
      { id: 'i1', title: '系统设计训练', status: 'active', answeredCount: 2, questionCount: 5 },
    ] as never);
    vi.mocked(listReviewItems).mockResolvedValue({
      items: [{ id: 'r1', prompt: '解释 CAP 定理' }],
      page: 1,
      pageSize: 5,
      total: 1,
    } as never);

    renderPage();

    expect(await screen.findByText('系统设计训练')).toBeInTheDocument();
    expect(screen.getByText('解释 CAP 定理')).toBeInTheDocument();
    expect(await screen.findByText('最近文件加载失败')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '向资料提问' })).toBeInTheDocument();
  });
});
