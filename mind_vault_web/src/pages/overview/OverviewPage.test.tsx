import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listConversations } from '../../api/conversations';
import { listDocuments } from '../../api/documents';
import { listInterviewSessions, listReviewItems } from '../../api/interview';
import { OverviewPage } from './OverviewPage';

vi.mock('../../api/conversations', () => ({ listConversations: vi.fn() }));
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
    vi.mocked(listConversations).mockReset();
    vi.mocked(listDocuments).mockReset();
    vi.mocked(listInterviewSessions).mockReset();
    vi.mocked(listReviewItems).mockReset();
  });

  it('matches the confirmed stats, interview progress and recent document actions', async () => {
    vi.mocked(listDocuments).mockImplementation(async (query) => query?.pageSize === 1 ? ({
      items: [],
      page: 1,
      pageSize: 1,
      total: 12,
    }) : ({
      items: [{
        id: 'doc-1',
        title: 'React 性能手册',
        status: 1,
        sourceFileExtension: 'pdf',
        sourceFileSize: '2840000',
        createdAt: '2026-09-29T08:00:00Z',
      }],
      page: 1,
      pageSize: 5,
      total: 1,
    }));
    vi.mocked(listConversations).mockResolvedValue([
      { id: 'c1' }, { id: 'c2' }, { id: 'c3' },
    ] as never);
    vi.mocked(listInterviewSessions).mockResolvedValue([
      { id: 'i1', title: '系统设计训练', status: 'active', currentIndex: 2, totalQuestions: 5 },
    ] as never);
    vi.mocked(listReviewItems).mockResolvedValue({
      items: [{ id: 'r1', title: '解释 CAP 定理' }, { id: 'r2', title: '说明缓存一致性' }],
      page: 1,
      pageSize: 5,
      total: 2,
    } as never);

    renderPage();

    expect(await screen.findByText('资料文件')).toBeInTheDocument();
    expect(screen.getByText('问答会话')).toBeInTheDocument();
    expect(screen.getAllByText('待复习')).toHaveLength(2);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(await screen.findByText('系统设计训练')).toBeInTheDocument();
    expect(screen.getByText('已完成 2/5 题')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '系统设计训练进度' })).toHaveAttribute('value', '40');
    expect(screen.getByRole('heading', { name: '最近资料' })).toBeInTheDocument();
    expect(screen.getByText(/PDF · 2\.7 MB/)).toBeInTheDocument();
    expect(screen.getByText('可问答')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看 React 性能手册' })).toHaveAttribute('href', '/app/library/documents/doc-1');
    expect(screen.getByRole('link', { name: '预览 React 性能手册' })).toHaveAttribute('href', '/app/library/documents/doc-1/preview');
  });

  it('keeps session and review queries independent when conversations fail', async () => {
    vi.mocked(listDocuments).mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0 });
    vi.mocked(listConversations).mockRejectedValue(new Error('conversations unavailable'));
    vi.mocked(listInterviewSessions).mockResolvedValue([
      { id: 'i1', title: '系统设计训练', status: 'active', currentIndex: 2, totalQuestions: 5 },
    ] as never);
    vi.mocked(listReviewItems).mockResolvedValue({
      items: [{ id: 'r1', title: '解释 CAP 定理' }],
      page: 1,
      pageSize: 5,
      total: 1,
    } as never);

    renderPage();

    expect(await screen.findByText('系统设计训练')).toBeInTheDocument();
    expect(screen.getByText('解释 CAP 定理')).toBeInTheDocument();
    expect(await screen.findByText('会话统计加载失败')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '向资料提问' })).toBeInTheDocument();
  });
});
