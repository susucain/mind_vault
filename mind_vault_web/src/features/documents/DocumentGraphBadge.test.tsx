import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Document } from '../../types/domain';
import { DocumentGraphBadge } from './DocumentGraphBadge';

function document(overrides: Partial<Document> = {}): Document {
  return { id: 'doc-1', title: '系统设计手册', status: 'ready', ...overrides };
}

describe('DocumentGraphBadge', () => {
  it('renders nothing when the list response does not carry the graph flag', () => {
    const { container } = render(
      <DocumentGraphBadge document={document()} onBuild={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers a build entry point when the graph was not built', async () => {
    const onBuild = vi.fn();
    render(
      <DocumentGraphBadge document={document({ graphEnabled: false })} onBuild={onBuild} />,
    );

    const button = screen.getByRole('button', { name: /未构建图谱/ });
    await userEvent.click(button);

    expect(onBuild).toHaveBeenCalledWith('doc-1');
  });

  it('shows a spinner and blocks repeated clicks while building', () => {
    render(
      <DocumentGraphBadge
        building
        document={document({ graphEnabled: false })}
        onBuild={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /正在入队/ })).toBeDisabled();
  });

  it('reports chunk progress while the graph is still building', () => {
    render(
      <DocumentGraphBadge
        document={document({
          graphEnabled: true,
          graph: { status: 'PROCESSING', completed: 3, total: 10, failed: 0 },
        })}
        onBuild={vi.fn()}
      />,
    );

    expect(screen.getByText('图谱构建中 3/10')).toBeInTheDocument();
  });

  it('marks a finished graph as ready', () => {
    render(
      <DocumentGraphBadge
        document={document({
          graphEnabled: true,
          graph: { status: 'READY', completed: 10, total: 10, failed: 0 },
        })}
        onBuild={vi.fn()}
      />,
    );

    expect(screen.getByText('图谱就绪')).toBeInTheDocument();
  });

  it('turns the failed state into a retry entry point', async () => {
    const onBuild = vi.fn();
    render(
      <DocumentGraphBadge
        document={document({
          graphEnabled: true,
          graph: { status: 'FAILED', completed: 7, total: 10, failed: 3 },
        })}
        onBuild={onBuild}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /图谱构建失败（3 块）/ }));

    expect(onBuild).toHaveBeenCalledWith('doc-1');
  });
});
