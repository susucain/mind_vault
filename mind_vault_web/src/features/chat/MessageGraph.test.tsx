import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAnswerContext } from '../../api/graph';
import type { Citation } from '../../types/domain';
import { MessageGraph } from './MessageGraph';

vi.mock('../../api/graph', () => ({
  fetchAnswerContext: vi.fn(),
  fetchNeighborhood: vi.fn(),
}));
// 只验证折叠/懒加载/空态行为，画布本身（ReactFlow）在 jsdom 下没有意义
vi.mock('../retrieval/components/GraphCanvas', () => ({
  GraphCanvas: () => <div data-testid="graph-canvas" />,
}));

function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    id: 'cite-1',
    documentId: 'doc-1',
    documentName: '系统设计手册',
    chunkId: 'chunk-1',
    excerpt: '引用片段',
    locator: { page: 4 },
    ...overrides,
  };
}

function renderGraph(citations: Citation[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MessageGraph citations={citations} />
    </QueryClientProvider>,
  );
}

describe('MessageGraph', () => {
  beforeEach(() => {
    vi.mocked(fetchAnswerContext).mockReset();
  });

  it('stays collapsed and does not query until expanded', async () => {
    vi.mocked(fetchAnswerContext).mockResolvedValue({ focus: '', nodes: [], edges: [], truncated: false });
    renderGraph([citation()]);

    const toggle = screen.getByRole('button', { name: /相关知识图谱/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // 默认折叠时不打图库：每轮回答都请求一次没有意义
    expect(fetchAnswerContext).not.toHaveBeenCalled();

    await userEvent.click(toggle);

    await waitFor(() => expect(fetchAnswerContext).toHaveBeenCalledTimes(1));
  });

  it('queries with the deduplicated chunk ids of this answer', async () => {
    vi.mocked(fetchAnswerContext).mockResolvedValue({ focus: '', nodes: [], edges: [], truncated: false });
    renderGraph([citation(), citation({ id: 'cite-2', chunkId: 'chunk-2' }), citation({ id: 'cite-3', chunkId: 'chunk-1' })]);

    await userEvent.click(screen.getByRole('button', { name: /相关知识图谱/ }));

    await waitFor(() =>
      expect(fetchAnswerContext).toHaveBeenCalledWith({ chunkIds: ['chunk-1', 'chunk-2'], limit: 40 }),
    );
  });

  it('explains the opt-in graph building instead of a blank canvas', async () => {
    vi.mocked(fetchAnswerContext).mockResolvedValue({ focus: '', nodes: [], edges: [], truncated: false });
    renderGraph([citation()]);

    await userEvent.click(screen.getByRole('button', { name: /相关知识图谱/ }));

    expect(await screen.findByText('本次引用的文档尚未构建图谱')).toBeInTheDocument();
    // 空态要能解释「为什么没有图谱」，否则看起来像功能坏了
    await userEvent.click(screen.getByText('为什么没有图谱？'));
    expect(
      screen.getByText(/知识图谱默认不在上传时构建/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('graph-canvas')).not.toBeInTheDocument();
  });

  it('renders the canvas once entities come back', async () => {
    vi.mocked(fetchAnswerContext).mockResolvedValue({
      focus: '',
      nodes: [{ id: 'kafka', name: 'Kafka', type: 'TECHNOLOGY', degree: 1 }],
      edges: [],
      truncated: false,
    });
    renderGraph([citation()]);

    await userEvent.click(screen.getByRole('button', { name: /相关知识图谱/ }));

    expect(await screen.findByTestId('graph-canvas')).toBeInTheDocument();
  });

  it('flags a truncated graph', async () => {
    vi.mocked(fetchAnswerContext).mockResolvedValue({
      focus: '',
      nodes: [{ id: 'kafka', name: 'Kafka', type: 'TECHNOLOGY', degree: 1 }],
      edges: [],
      truncated: true,
    });
    renderGraph([citation()]);

    await userEvent.click(screen.getByRole('button', { name: /相关知识图谱/ }));

    expect(await screen.findByText('图谱较大，已截断展示')).toBeInTheDocument();
  });

  it('offers a retry when the graph query fails', async () => {
    vi.mocked(fetchAnswerContext).mockRejectedValue(new Error('图库不可用'));
    renderGraph([citation()]);

    await userEvent.click(screen.getByRole('button', { name: /相关知识图谱/ }));

    expect(await screen.findByText('图谱加载失败，可稍后重试')).toBeInTheDocument();
    // 失败不影响引用本身，只是这一块降级
    expect(screen.getByRole('button', { name: /相关知识图谱/ })).toBeInTheDocument();
  });

  it('renders nothing when the answer has no chunk ids', () => {
    const { container } = renderGraph([citation({ chunkId: '' })]);

    expect(container).toBeEmptyDOMElement();
  });
});
