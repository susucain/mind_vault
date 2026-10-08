import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadPanel } from './UploadPanel';

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn() }));

const { supportedExtensions } = vi.hoisted(() => ({
  supportedExtensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'md', 'csv', 'json'],
}));

vi.mock('../../hooks/use-upload-queue', () => ({
  useUploadQueue: () => ({
    cancel: vi.fn(),
    enqueue,
    items: [],
    retry: vi.fn(),
    stopTracking: vi.fn(),
  }),
}));

vi.mock('./queries', () => ({
  useSupportedFormats: () => ({ data: { extensions: supportedExtensions } }),
}));

const dataset = {
  id: 'dataset-1',
  name: '计算机基础',
  documentCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const secondDataset = {
  id: 'dataset-2',
  name: '算法笔记',
  documentCount: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function renderPanel(onEnqueued = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onEnqueued,
    ...render(
      <QueryClientProvider client={client}>
        <UploadPanel
          datasets={[dataset, secondDataset]}
          onCreateDataset={vi.fn()}
          onEnqueued={onEnqueued}
        />
      </QueryClientProvider>,
    ),
  };
}

describe('UploadPanel', () => {
  beforeEach(() => {
    enqueue.mockReset();
  });

  it('renders dataset selection without an upload queue', () => {
    renderPanel();

    expect(screen.getByLabelText('上传到资料集')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '上传队列' })).not.toBeInTheDocument();
  });

  it('notifies the parent after files are added to the queue', async () => {
    const user = userEvent.setup();
    const { onEnqueued } = renderPanel();
    const file = new File(['content'], 'notes.md', { type: 'text/markdown' });

    await user.upload(screen.getByLabelText('选择文件'), file);

    expect(enqueue).toHaveBeenCalledWith([file], 'dataset-1', { graphEnabled: false, extensions: supportedExtensions });
    expect(onEnqueued).toHaveBeenCalledWith('dataset-1');
  });

  it('切换资料集后按新选的资料集入队', async () => {
    const user = userEvent.setup();
    const { onEnqueued } = renderPanel();
    const file = new File(['content'], 'notes.md', { type: 'text/markdown' });

    await user.click(screen.getByLabelText('上传到资料集'));
    await user.click(await screen.findByRole('option', { name: /算法笔记/ }));
    await user.upload(screen.getByLabelText('选择文件'), file);

    expect(enqueue).toHaveBeenCalledWith([file], 'dataset-2', { graphEnabled: false, extensions: supportedExtensions });
    expect(onEnqueued).toHaveBeenCalledWith('dataset-2');
  });

  it('勾选构建知识图谱后按开启状态入队', async () => {
    const user = userEvent.setup();
    renderPanel();
    const file = new File(['content'], 'notes.md', { type: 'text/markdown' });

    await user.click(screen.getByLabelText(/构建知识图谱/));
    await user.upload(screen.getByLabelText('选择文件'), file);

    expect(enqueue).toHaveBeenCalledWith([file], 'dataset-1', { graphEnabled: true, extensions: supportedExtensions });
  });
});
