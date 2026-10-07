import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversation, getConversation, updateConversation } from '../../api/conversations';
import { ChatPage } from './ChatPage';

const sseMock = vi.hoisted(() => ({ start: vi.fn(), abort: vi.fn() }));

vi.mock('../../api/conversations', () => ({
  listConversations: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false }),
  getConversation: vi.fn(),
  listMessages: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  createMessageStreamRequest: vi.fn((id: string, content: string) => ({ path: `/conversations/${id}/messages/stream`, init: { method: 'POST', body: { content } } })),
}));
vi.mock('../../api/datasets', () => ({ listDatasets: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }) }));
vi.mock('../../hooks/use-sse', () => ({ useSse: () => sseMock }));

/** 用真实路由渲染问答页：新建会话后要能跳到 /app/chat/:id，才能验证路由变化不丢本轮会话 */
function chatWorkspace(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/chat/new']}>
        <Routes>
          <Route element={<ChatPage isNew />} path="/app/chat/new" />
          <Route element={<ChatPage />} path="/app/chat/:conversationId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createConversation).mockResolvedValue({ id: 'created-1', title: '问题', datasetIds: [], favorite: false, createdAt: 'now', updatedAt: 'now' });
    sseMock.start.mockResolvedValue(undefined);
  });

  it('renders the usable empty chat workspace', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ChatPage isNew /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: '从资料中开始提问' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '输入问题' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送问题' })).toBeDisabled();
  });

  it('exposes new-conversation, scope picker and history entry points', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ChatPage isNew /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('button', { name: '打开会话历史' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '开启新对话' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '资料集范围：全部资料集' })).toBeInTheDocument();
  });

  it('sends on Enter and keeps Shift+Enter for a newline', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(chatWorkspace(client));

    const composer = await screen.findByRole('textbox', { name: '输入问题' });
    await user.type(composer, '第一行');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    // Shift+Enter 只换行，不触发发送
    expect(sseMock.start).not.toHaveBeenCalled();
    expect(composer).toHaveValue('第一行\n');

    await user.type(composer, '第二行{Enter}');
    await waitFor(() => expect(sseMock.start).toHaveBeenCalledTimes(1));
    expect(sseMock.start.mock.calls[0]?.[1]?.init?.body).toEqual({ content: '第一行\n第二行' });
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
    vi.mocked(getConversation).mockResolvedValue({ id: 'created-1', title: '结果问题', datasetIds: [], favorite: false, createdAt: 'now', updatedAt: 'now' });
    sseMock.start.mockImplementation(async (_path: string, options: { onEvent: (event: unknown) => void }) => {
      options.onEvent({ type: 'result', result: { content: '结果答案' } });
      options.onEvent({ type: 'done', messageId: 'm1' });
    });
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(chatWorkspace(client));
    await user.type(await screen.findByRole('textbox', { name: '输入问题' }), '结果问题');
    await user.click(screen.getByRole('button', { name: '发送问题' }));
    // 建会话后路由换成 /app/chat/:id，答案与提问都还在（路由变化不能丢掉本轮会话）
    expect(await screen.findByText('结果答案')).toBeInTheDocument();
    expect(screen.getByText('结果问题')).toBeInTheDocument();
  });

  it('persists the session favorite and flips the star button', async () => {
    vi.mocked(getConversation).mockResolvedValue({ id: 'c1', title: '缓存策略', datasetIds: [], favorite: false, createdAt: 'now', updatedAt: 'now' });
    vi.mocked(updateConversation).mockResolvedValue({ id: 'c1', title: '缓存策略', datasetIds: [], favorite: true, createdAt: 'now', updatedAt: 'now' });
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/app/chat/c1']}><Routes><Route element={<ChatPage />} path="/app/chat/:conversationId" /></Routes></MemoryRouter></QueryClientProvider>);

    await screen.findByRole('heading', { name: '缓存策略' });
    await user.click(screen.getByRole('button', { name: '收藏会话' }));

    await waitFor(() => expect(updateConversation).toHaveBeenCalledWith('c1', { favorite: true }));
    expect(await screen.findByRole('button', { name: '取消收藏' })).toBeInTheDocument();
  });

  it('rolls the favorite back and surfaces a readable error when persisting fails', async () => {
    vi.mocked(getConversation).mockResolvedValue({ id: 'c1', title: '缓存策略', datasetIds: [], favorite: false, createdAt: 'now', updatedAt: 'now' });
    vi.mocked(updateConversation).mockRejectedValueOnce(new Error('收藏服务不可用'));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/app/chat/c1']}><Routes><Route element={<ChatPage />} path="/app/chat/:conversationId" /></Routes></MemoryRouter></QueryClientProvider>);

    await screen.findByRole('heading', { name: '缓存策略' });
    await user.click(screen.getByRole('button', { name: '收藏会话' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('收藏服务不可用');
    await waitFor(() => expect(screen.getByRole('button', { name: '收藏会话' })).toBeInTheDocument());
  });

  it('replaces the generic prompts with the follow-up questions of the last answer', async () => {
    vi.mocked(getConversation).mockResolvedValue({ id: 'created-1', title: 'Kafka', datasetIds: [], favorite: false, createdAt: 'now', updatedAt: 'now' });
    sseMock.start.mockImplementation(async (_path: string, options: { onEvent: (event: unknown) => void }) => {
      options.onEvent({ type: 'message_start', messageId: 'm1' });
      options.onEvent({ type: 'token', content: '答案' });
      options.onEvent({ type: 'suggestions', items: ['那它的缺点呢', '还有别的方案吗', '怎么落地'] });
      options.onEvent({ type: 'done', messageId: 'm1' });
    });
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(chatWorkspace(client));

    // 新会话先给通用引导，回答结束后换成本轮产物
    expect(await screen.findByRole('button', { name: '总结这组资料的关键结论' })).toBeInTheDocument();

    await user.type(await screen.findByRole('textbox', { name: '输入问题' }), 'Kafka 用在什么场景？');
    await user.click(screen.getByRole('button', { name: '发送问题' }));

    expect(await screen.findByRole('button', { name: '那它的缺点呢' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '怎么落地' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '总结这组资料的关键结论' })).not.toBeInTheDocument();
  });

  it('fills the composer and puts the caret at the end when a follow-up is clicked', async () => {
    vi.mocked(getConversation).mockResolvedValue({ id: 'created-1', title: 'Kafka', datasetIds: [], favorite: false, createdAt: 'now', updatedAt: 'now' });
    sseMock.start.mockImplementation(async (_path: string, options: { onEvent: (event: unknown) => void }) => {
      options.onEvent({ type: 'suggestions', items: ['那它的缺点呢', '还有别的方案吗', '怎么落地'] });
      options.onEvent({ type: 'done', messageId: 'm1' });
    });
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(chatWorkspace(client));

    await user.type(await screen.findByRole('textbox', { name: '输入问题' }), 'Kafka 用在什么场景？');
    await user.click(screen.getByRole('button', { name: '发送问题' }));
    await user.click(await screen.findByRole('button', { name: '还有别的方案吗' }));

    const composer = screen.getByRole('textbox', { name: '输入问题' }) as HTMLTextAreaElement;
    expect(composer).toHaveValue('还有别的方案吗');
    expect(composer).toHaveFocus();
    expect(composer.selectionStart).toBe('还有别的方案吗'.length);
    // 只填充不发送，避免误发
    expect(sseMock.start).toHaveBeenCalledTimes(1);
  });
});
