import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';

vi.mock('../../api/conversations', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  listMessages: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  createMessageStreamRequest: vi.fn(),
}));
vi.mock('../../api/datasets', () => ({ listDatasets: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }) }));

describe('ChatPage', () => {
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
});
