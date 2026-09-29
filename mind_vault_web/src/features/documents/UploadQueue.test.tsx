import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadStore } from '../../stores/upload.store';
import { UploadQueue } from './UploadQueue';

describe('UploadQueue', () => {
  beforeEach(() => useUploadStore.getState().reset());

  it('renders progress, processing failure details and queue actions', async () => {
    useUploadStore.setState({
      items: [
        { localId: '1', file: new File(['a'], 'upload.pdf'), datasetId: 'd', status: 'uploading', progress: 42 },
        { localId: '2', file: new File(['b'], 'index.md'), datasetId: 'd', status: 'processing', progress: 100, failedStage: 'embedding' },
        { localId: '3', file: new File(['c'], 'broken.docx'), datasetId: 'd', status: 'failed', progress: 100, failedStage: 'parsing', errorMessage: '解析失败' },
      ],
    });
    const retry = vi.fn();
    const cancel = vi.fn();

    render(<UploadQueue cancel={cancel} items={useUploadStore.getState().items} retry={retry} />);

    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('正在处理：embedding')).toBeInTheDocument();
    expect(screen.getByText('失败于 parsing：解析失败')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试 broken.docx' }));
    await userEvent.click(screen.getByRole('button', { name: '取消 upload.pdf' }));
    expect(retry).toHaveBeenCalledWith('3');
    expect(cancel).toHaveBeenCalledWith('1');
  });
});
