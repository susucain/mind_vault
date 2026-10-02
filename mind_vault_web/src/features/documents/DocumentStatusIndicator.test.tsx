import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentStatusIndicator } from './DocumentStatusIndicator';

describe('DocumentStatusIndicator', () => {
  it('renders the ready status as an icon and label without a background pill', () => {
    render(<DocumentStatusIndicator status="ready" />);

    expect(screen.getByText('可问答')).toBeInTheDocument();
    expect(screen.getByTestId('document-status-icon')).toHaveAttribute('aria-label', '可问答');
    expect(screen.getByText('可问答').closest('[data-status-tone]')).toHaveAttribute('data-status-tone', 'success');
  });

  it.each([
    ['pending', '等待处理'],
    ['uploading', '上传中'],
    ['processing', '处理中'],
    ['failed', '处理失败'],
    ['archived', '已归档'],
  ] as const)('maps %s to %s', (status, label) => {
    render(<DocumentStatusIndicator status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
