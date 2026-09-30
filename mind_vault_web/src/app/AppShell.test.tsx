import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('AppShell', () => {
  afterEach(() => setViewport(1024));

  it('marks the current desktop navigation item active and renders route children', () => {
    setViewport(1024);

    render(
      <MemoryRouter initialEntries={['/app/library']}>
        <AppShell>
          <h1>Library content</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '个人设置' })).toHaveAttribute('href', '/app/settings/account');
    expect(screen.getByRole('heading', { name: 'Library content' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Mobile navigation')).not.toBeInTheDocument();
  });

  it('uses a compact icon sidebar from 768px to 980px', () => {
    setViewport(768);

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <AppShell>
          <h1>Overview</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Desktop navigation')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByRole('link', { name: '概览' })).toHaveAttribute('aria-current', 'page');
  });

  it('replaces the sidebar with mobile navigation at 767px', () => {
    setViewport(767);

    render(
      <MemoryRouter initialEntries={['/app/interview']}>
        <AppShell>
          <h1>Interview</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Desktop navigation')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mobile navigation')).toBeInTheDocument();
  });

  it('uses a fullscreen shell without top or bottom navigation for mobile preview routes', () => {
    setViewport(390);

    render(
      <MemoryRouter initialEntries={['/app/library/documents/doc-1/preview?page=2']}>
        <AppShell><h1>原文预览</h1></AppShell>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mobile navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('page-container--fullscreen');
  });

  it('keeps the compact sidebar at 979px', () => {
    setViewport(979);

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <AppShell>
          <h1>Overview</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Desktop navigation')).toHaveAttribute('data-compact', 'true');
  });

  it('uses the full desktop sidebar at 980px', () => {
    setViewport(980);

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <AppShell>
          <h1>Overview</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Desktop navigation')).toHaveAttribute('data-compact', 'false');
  });

});
