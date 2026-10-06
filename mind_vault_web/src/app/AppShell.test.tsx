import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

/** 顶栏用户菜单会读 profile 查询，因此 AppShell 现在需要 QueryClient 上下文 */
function renderShell(entry: string, content: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>{content}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  afterEach(() => setViewport(1024));

  it('marks the current desktop navigation item active and renders route children', () => {
    setViewport(1024);

    renderShell('/app/library', <AppShell><h1>Library content</h1></AppShell>);

    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '个人设置' })).toHaveAttribute('href', '/app/settings/account');
    expect(screen.getByRole('heading', { name: 'Library content' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Mobile navigation')).not.toBeInTheDocument();
  });

  it('uses a compact icon sidebar from 768px to 980px', () => {
    setViewport(768);

    renderShell('/app/overview', <AppShell><h1>Overview</h1></AppShell>);

    expect(screen.getByLabelText('Desktop navigation')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByRole('link', { name: '概览' })).toHaveAttribute('aria-current', 'page');
  });

  it('replaces the sidebar with mobile navigation at 767px', () => {
    setViewport(767);

    renderShell('/app/interview', <AppShell><h1>Interview</h1></AppShell>);

    expect(screen.queryByLabelText('Desktop navigation')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mobile navigation')).toBeInTheDocument();
  });

  it('uses a fullscreen shell without top or bottom navigation for mobile preview routes', () => {
    setViewport(390);

    renderShell('/app/library/documents/doc-1/preview?page=2', <AppShell><h1>原文预览</h1></AppShell>);

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mobile navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('page-container--fullscreen');
  });

  it('keeps the compact sidebar at 979px', () => {
    setViewport(979);

    renderShell('/app/overview', <AppShell><h1>Overview</h1></AppShell>);

    expect(screen.getByLabelText('Desktop navigation')).toHaveAttribute('data-compact', 'true');
  });

  it('uses the full desktop sidebar at 980px', () => {
    setViewport(980);

    renderShell('/app/overview', <AppShell><h1>Overview</h1></AppShell>);

    expect(screen.getByLabelText('Desktop navigation')).toHaveAttribute('data-compact', 'false');
  });

  it('exposes the account menu in the header', () => {
    setViewport(1024);

    renderShell('/app/overview', <AppShell><h1>Overview</h1></AppShell>);

    expect(screen.getByRole('button', { name: '账户菜单' })).toBeInTheDocument();
  });

});
