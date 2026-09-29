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

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings/account');
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
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

});
