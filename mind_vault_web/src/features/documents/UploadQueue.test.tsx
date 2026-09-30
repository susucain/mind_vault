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
        { localId: '1', file: new File(['a'], 'upload.pdf'), datasetId: 'd', status: 'uploading', progress: 0 },
        { localId: '2', file: new File(['b'], 'index.md'), datasetId: 'd', documentId: 'doc-2', status: 'processing', progress: 30, currentStage: 'chunking', stageProgress: { completed: 3, total: 10, percent: 30 } },
        { localId: '3', file: new File(['c'], 'broken.docx'), datasetId: 'd', status: 'failed', progress: 0, failedStage: 'validation', errorMessage: '解析失败' },
      ],
    });
    const retry = vi.fn();
    const cancel = vi.fn();
    const stopTracking = vi.fn();

    render(<UploadQueue cancel={cancel} items={useUploadStore.getState().items} retry={retry} stopTracking={stopTracking} />);

    expect(screen.getByText('正在上传（服务端未提供进度）')).toBeInTheDocument();
    expect(screen.getByText('正在处理：chunking · 3/10')).toBeInTheDocument();
    expect(screen.getByText('失败于 validation：解析失败')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消 index.md' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '停止跟踪 index.md' }));
    await userEvent.click(screen.getByRole('button', { name: '重试 broken.docx' }));
    await userEvent.click(screen.getByRole('button', { name: '取消 upload.pdf' }));
    expect(stopTracking).toHaveBeenCalledWith('2');
    expect(retry).toHaveBeenCalledWith('3');
    expect(cancel).toHaveBeenCalledWith('1');
  });
});
