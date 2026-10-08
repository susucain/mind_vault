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

  it('区分已可问答与未构建图谱的完成文案', () => {
    render(
      <UploadQueue
        cancel={vi.fn()}
        items={[
          { localId: '1', file: new File(['a'], 'graph.md'), datasetId: 'd', graphEnabled: true, status: 'ready', progress: 100 },
          { localId: '2', file: new File(['b'], 'plain.md'), datasetId: 'd', graphEnabled: false, status: 'ready', progress: 100 },
        ]}
        retry={vi.fn()}
        stopTracking={vi.fn()}
      />,
    );

    expect(screen.getByText('已可问答')).toBeInTheDocument();
    expect(screen.getByText('已可问答（未构建图谱）')).toBeInTheDocument();
  });

  it('keeps tracking a ready document while its graph is still building', async () => {
    const stopTracking = vi.fn();
    render(
      <UploadQueue
        cancel={vi.fn()}
        items={[
          {
            localId: '1',
            file: new File(['a'], 'graph.md'),
            datasetId: 'd',
            documentId: 'doc-1',
            graphEnabled: true,
            status: 'ready',
            progress: 100,
            graphProgress: { status: 'PROCESSING', completed: 3, total: 10, failed: 0 },
          },
        ]}
        retry={vi.fn()}
        stopTracking={stopTracking}
      />,
    );

    expect(screen.getByText('已可问答 · 正在构建知识图谱 3/10')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'graph.md 图谱构建进度' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '停止跟踪 graph.md' }));
    expect(stopTracking).toHaveBeenCalledWith('1');
  });
});
