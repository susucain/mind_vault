import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the application shell at the root route', () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Mind Vault' })).toBeInTheDocument();
  });
});
