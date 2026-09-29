import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MobileBottomNav } from './AppShell';

describe('MobileBottomNav', () => {
  it('shows overview, library, interview, and account navigation without chat', () => {
    render(
      <MemoryRouter initialEntries={['/app/settings/account']}>
        <MobileBottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/app/overview');
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/app/library');
    expect(screen.getByRole('link', { name: 'Interview' })).toHaveAttribute('href', '/app/interview');
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/app/settings/account');
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Chat' })).not.toBeInTheDocument();
  });
});
