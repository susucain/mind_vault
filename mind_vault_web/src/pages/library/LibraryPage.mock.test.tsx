import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LibraryPage } from './LibraryPage';

vi.mock('../../lib/config', () => ({ appConfig: { enableMockApi: true } }));

describe('LibraryPage mock capabilities', () => {
  it('renders the document list in mock mode', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><LibraryPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('React 性能优化手册')).toBeInTheDocument();
  });
});
