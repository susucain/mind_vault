import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MobileBottomNav } from './AppShell';

describe('MobileBottomNav', () => {
  it('shows Chinese mobile labels for overview, library, interview, and account without chat', () => {
    render(
      <MemoryRouter initialEntries={['/app/settings/account']}>
        <MobileBottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '首页' })).toHaveAttribute('href', '/app/overview');
    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('href', '/app/library');
    expect(screen.getByRole('link', { name: '面试' })).toHaveAttribute('href', '/app/interview');
    expect(screen.getByRole('link', { name: '我的' })).toHaveAttribute('href', '/app/settings/account');
    expect(screen.getByRole('link', { name: '我的' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Chat' })).not.toBeInTheDocument();
  });
});
