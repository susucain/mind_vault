import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversation } from '../../api/conversations';
import { ChatPage } from './ChatPage';

const sseMock = vi.hoisted(() => ({ start: vi.fn(), abort: vi.fn() }));

vi.mock('../../api/conversations', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  listMessages: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  createMessageStreamRequest: vi.fn((id: string, content: string) => ({ path: `/conversations/${id}/messages/stream`, init: { method: 'POST', body: { content } } })),
}));
vi.mock('../../api/datasets', () => ({ listDatasets: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }) }));
vi.mock('../../hooks/use-sse', () => ({ useSse: () => sseMock }));

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createConversation).mockResolvedValue({ id: 'created-1', title: '问题', datasetIds: [], createdAt: 'now', updatedAt: 'now' });
    sseMock.start.mockResolvedValue(undefined);
  });

  it('renders the usable empty chat workspace', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ChatPage isNew /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: '从资料中开始提问' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '输入问题' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送问题' })).toBeDisabled();
  });

  it('exposes mobile drawer controls without rendering desktop sidebars as the only navigation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ChatPage isNew /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('button', { name: '打开会话历史' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^引用\s*$/ })).toBeInTheDocument();
  });

  it('shows a retryable error when creating a conversation fails', async () => {
    vi.mocked(createConversation).mockRejectedValueOnce(new Error('创建失败'));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ChatPage isNew /></MemoryRouter></QueryClientProvider>);
    await user.type(await screen.findByRole('textbox', { name: '输入问题' }), '原始问题');
    await user.click(screen.getByRole('button', { name: '发送问题' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('创建失败');
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
  });

  it('continues with the original prompt without appending a new user message', async () => {
    sseMock.start.mockImplementation(() => new Promise<void>(() => undefined));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ChatPage isNew /></MemoryRouter></QueryClientProvider>);
    await user.type(await screen.findByRole('textbox', { name: '输入问题' }), '原始问题');
    await user.click(screen.getByRole('button', { name: '发送问题' }));
    await user.click(await screen.findByRole('button', { name: '停止生成' }));
    await user.click(screen.getByRole('button', { name: '继续生成' }));
    await waitFor(() => expect(sseMock.start).toHaveBeenCalledTimes(2));
    expect(sseMock.start.mock.calls[1]?.[1]?.init?.body).toEqual({ content: '原始问题' });
    expect(screen.getAllByText('原始问题')).toHaveLength(1);
  });

  it('displays an answer from a result-only stream frame', async () => {
    sseMock.start.mockImplementation(async (_path: string, options: { onEvent: (event: unknown) => void }) => {
      options.onEvent({ type: 'result', result: { content: '结果答案' } });
      options.onEvent({ type: 'done', messageId: 'm1' });
    });
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ChatPage isNew /></MemoryRouter></QueryClientProvider>);
    await user.type(await screen.findByRole('textbox', { name: '输入问题' }), '结果问题');
    await user.click(screen.getByRole('button', { name: '发送问题' }));
    expect(await screen.findByText('结果答案')).toBeInTheDocument();
  });
});
