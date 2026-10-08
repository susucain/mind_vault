import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/errors';
import type { UploadDocumentResult } from '../api/documents';
import type { DocumentProgressHandlers } from '../features/documents/document-progress-stream';
import { useUploadQueue } from './use-upload-queue';
import { useUploadStore } from '../stores/upload.store';

const { uploadDocument, getDocumentStatus, retryDocument, cancelDocument, connectDocumentProgress } = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  getDocumentStatus: vi.fn(),
  retryDocument: vi.fn(),
  cancelDocument: vi.fn(),
  connectDocumentProgress: vi.fn(),
}));

vi.mock('../api/documents', () => ({ uploadDocument, getDocumentStatus, retryDocument, cancelDocument }));
vi.mock('../features/documents/document-progress-stream', () => ({ connectDocumentProgress }));

/** 捕获进度流订阅方注册的处理器，用于在测试里手工推送 SSE 帧 */
let streamHandlers: DocumentProgressHandlers | undefined;
let streamClosed = false;

function createFile(name: string, size = 7): File {
  const file = new File(['content'], name, { type: 'text/plain' });
  // 双闸门按 file.size 计算；测试里不便构造 100MB 真实内容，直接覆写只读的 size。
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('useUploadQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    uploadDocument.mockReset();
    getDocumentStatus.mockReset();
    retryDocument.mockReset();
    cancelDocument.mockReset();
    connectDocumentProgress.mockReset();
    streamHandlers = undefined;
    streamClosed = false;
    // 默认不建立连接也不触发 onClose：既有用例继续走轮询兜底路径
    connectDocumentProgress.mockImplementation((handlers: DocumentProgressHandlers) => {
      streamHandlers = handlers;
      return () => {
        streamClosed = true;
      };
    });
    useUploadStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs at most three uploads and starts queued work after an upload completes', async () => {
    const uploads = Array.from({ length: 4 }, () => deferred<UploadDocumentResult>());
    let nextUpload = 0;
    uploadDocument.mockImplementation(() => uploads[nextUpload++]!.promise);
    const { result } = renderHook(() => useUploadQueue());

    act(() => {
      result.current.enqueue([
        createFile('a.txt'),
        createFile('b.txt'),
        createFile('c.txt'),
        createFile('d.txt'),
      ], 'dataset-1');
    });
    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(3));

    await act(async () => {
      uploads[0]?.resolve({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    });
    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(4));
  });

  it('keeps large files queued when they would exceed the byte gate', async () => {
    const uploads = [deferred<UploadDocumentResult>(), deferred<UploadDocumentResult>()];
    let nextUpload = 0;
    uploadDocument.mockImplementation(() => uploads[nextUpload++]!.promise);
    getDocumentStatus.mockResolvedValue({
      status: 'CHUNKING',
      currentStage: 'chunking',
      errorMessage: null,
      stageProgress: { completed: 1, total: 10, percent: 10 },
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => {
      // 两份 100MB 文件：文件数闸门（3）未满，但字节闸门（150MB）只容得下一份
      result.current.enqueue(
        [createFile('big-a.txt', 100 * 1024 * 1024), createFile('big-b.txt', 100 * 1024 * 1024)],
        'dataset-1',
      );
    });
    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    expect(result.current.items.filter((item) => item.status === 'uploading')).toHaveLength(1);
    expect(result.current.items.filter((item) => item.status === 'queued')).toHaveLength(1);

    await act(async () => {
      uploads[0]?.resolve({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    });
    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(2));
  });

  it('records the duplicate document reference when the backend rejects a repeated file', async () => {
    uploadDocument.mockRejectedValueOnce(
      new ApiRequestError({
        status: 409,
        code: 'DUPLICATE_DOCUMENT',
        message: '该文件已存在：a.txt',
        details: { duplicateOf: { id: 'doc-9', name: 'a.txt', createdAt: '2026-01-01T00:00:00.000Z' } },
      }),
    );
    uploadDocument.mockReturnValueOnce(deferred<UploadDocumentResult>().promise);
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await act(async () => {
      await vi.waitFor(() =>
        expect(result.current.items[0]).toMatchObject({
          status: 'failed',
          duplicateOf: { id: 'doc-9', name: 'a.txt' },
        }),
      );
    });

    await act(async () => {
      await result.current.retry(result.current.items[0].localId);
    });
    await vi.waitFor(() => expect(result.current.items[0]).toMatchObject({ status: 'uploading' }));
    expect(result.current.items[0].duplicateOf).toBeUndefined();
  });

  it('cancels queued uploads before a request starts', async () => {
    const pending = deferred<Document>();
    uploadDocument.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useUploadQueue());

    act(() => {
      result.current.enqueue(
        [createFile('a.txt'), createFile('b.txt'), createFile('c.txt'), createFile('d.txt')],
        'dataset-1',
      );
    });
    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(3));
    const queued = result.current.items.find((item) => item.status === 'queued')!;
    act(() => result.current.cancel(queued.localId));

    expect(result.current.items.find((item) => item.localId === queued.localId)).toMatchObject({
      status: 'cancelled',
    });
    expect(uploadDocument).toHaveBeenCalledTimes(3);
  });

  it('stores the backend failed stage and allows retrying', async () => {
    uploadDocument.mockRejectedValueOnce(
      new ApiRequestError({
        status: 422,
        code: 'UPLOAD_FAILED',
        message: 'parser failed',
        details: { stage: 'parsing' },
      }),
    );
    uploadDocument.mockReturnValueOnce(deferred<UploadDocumentResult>().promise);
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await act(async () => {
      await vi.waitFor(() =>
        expect(result.current.items[0]).toMatchObject({
          status: 'failed',
          failedStage: 'parsing',
          errorMessage: 'parser failed',
        }),
      );
    });

    await act(async () => {
      await result.current.retry(result.current.items[0].localId);
    });

    await vi.waitFor(() =>
      expect(uploadDocument).toHaveBeenCalledTimes(2),
    );
    expect(result.current.items[0]).toMatchObject({ status: 'uploading', failedStage: undefined });
  });

  it('normalizes the backend READY status and currentStage after the two second poll', async () => {
    uploadDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    getDocumentStatus.mockResolvedValue({
      status: 'READY',
      currentStage: 'ready',
      errorMessage: null,
      stageProgress: { completed: 5, total: 5, percent: 100 },
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await vi.waitFor(() => expect(result.current.items[0]).toMatchObject({ status: 'processing' }));
    expect(getDocumentStatus).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.items[0]).toMatchObject({
      status: 'ready',
      progress: 100,
      failedStage: undefined,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(getDocumentStatus).toHaveBeenCalledTimes(1);
  });

  it('normalizes FAILED and persists currentStage and errorMessage', async () => {
    uploadDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    getDocumentStatus.mockResolvedValue({
      status: 'FAILED',
      currentStage: 'embedding',
      errorMessage: 'embedding worker failed',
      stageProgress: { completed: 2, total: 5, percent: 40 },
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await vi.waitFor(() => expect(result.current.items[0]).toMatchObject({ status: 'processing' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.items[0]).toMatchObject({
      status: 'failed',
      failedStage: 'embedding',
      errorMessage: 'embedding worker failed',
    });
  });

  it('does not expose a non-failure stage as failedStage for cancelled jobs', async () => {
    uploadDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    getDocumentStatus.mockResolvedValue({
      status: 'CANCELLED',
      currentStage: 'cancelled',
      errorMessage: null,
      stageProgress: { completed: 1, total: 5, percent: 20 },
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await vi.waitFor(() => expect(result.current.items[0]).toMatchObject({ status: 'processing' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.items[0]).toMatchObject({
      status: 'cancelled',
      currentStage: 'cancelled',
      failedStage: undefined,
    });
  });

  it('uses backend stageProgress while processing', async () => {
    uploadDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    getDocumentStatus.mockResolvedValue({
      documentId: 'doc-1',
      jobId: 'job-1',
      status: 'CHUNKING',
      currentStage: 'chunking',
      errorMessage: null,
      stageProgress: { completed: 3, total: 10, percent: 30 },
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await vi.waitFor(() => expect(result.current.items[0]).toMatchObject({ status: 'processing' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.items[0]).toMatchObject({
      status: 'processing',
      currentStage: 'chunking',
      progress: 30,
      stageProgress: { completed: 3, total: 10, percent: 30 },
    });
  });

  it('retries a failed backend job without uploading the file again', async () => {
    retryDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    useUploadStore.setState({
      items: [{
        localId: 'local-1',
        file: createFile('a.txt'),
        datasetId: 'dataset-1',
        documentId: 'doc-1',
        status: 'failed',
        progress: 40,
        currentStage: 'embedding',
        errorMessage: 'failed',
      }],
    });
    const { result } = renderHook(() => useUploadQueue());

    await act(async () => result.current.retry('local-1'));

    expect(retryDocument).toHaveBeenCalledWith('doc-1');
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({ status: 'processing', documentId: 'doc-1' });
  });

  it('aborts the real upload request when cancelling an uploading item', async () => {
    const pending = deferred<UploadDocumentResult>();
    uploadDocument.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useUploadQueue());
    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalledOnce());
    const options = uploadDocument.mock.calls[0]?.[2];

    act(() => result.current.cancel(result.current.items[0].localId));

    expect(options.signal.aborted).toBe(true);
    expect(result.current.items[0].status).toBe('cancelled');
  });

  it('drives the queue progress from the upload byte progress', async () => {
    const pending = deferred<UploadDocumentResult>();
    uploadDocument.mockImplementation((...args: unknown[]) => {
      const options = args[2] as { onProgress?: (percent: number) => void };
      options.onProgress?.(42);
      return pending.promise;
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));

    await vi.waitFor(() =>
      expect(result.current.items[0]).toMatchObject({ status: 'uploading', progress: 42 }),
    );
  });

  it('applies progress pushed over SSE and skips polling while the stream is open', async () => {
    uploadDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await vi.waitFor(() => expect(result.current.items[0]).toMatchObject({ status: 'processing' }));
    await vi.waitFor(() => expect(streamHandlers).toBeDefined());

    act(() => {
      streamHandlers?.onOpen?.();
      streamHandlers?.onEvent({
        ownerId: 'user-1',
        documentId: 'doc-1',
        stage: 'chunking',
        status: 'CHUNKING',
        completed: 3,
        total: 10,
        percent: 30,
      });
    });
    expect(result.current.items[0]).toMatchObject({
      status: 'processing',
      currentStage: 'chunking',
      progress: 30,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(getDocumentStatus).not.toHaveBeenCalled();

    act(() => {
      streamHandlers?.onEvent({
        ownerId: 'user-1',
        documentId: 'doc-1',
        stage: 'ready',
        status: 'READY',
        completed: 1,
        total: 1,
        percent: 100,
      });
    });
    expect(result.current.items[0]).toMatchObject({ status: 'ready', progress: 100 });
  });

  it('falls back to polling after the progress stream drops', async () => {
    uploadDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    getDocumentStatus.mockResolvedValue({
      status: 'CHUNKING',
      currentStage: 'chunking',
      errorMessage: null,
      stageProgress: { completed: 3, total: 10, percent: 30 },
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await vi.waitFor(() => expect(streamHandlers).toBeDefined());
    act(() => streamHandlers?.onOpen?.());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(getDocumentStatus).not.toHaveBeenCalled();

    // 断线：重新降级到 2s 轮询兜底
    act(() => streamHandlers?.onClose?.(new Error('connection lost')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await vi.waitFor(() => expect(getDocumentStatus).toHaveBeenCalledTimes(1));
    expect(result.current.items[0]).toMatchObject({ currentStage: 'chunking', progress: 30 });
  });

  it('notifies the backend when cancelling a job that has not started processing', async () => {
    cancelDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'CANCELLED' });
    useUploadStore.setState({
      items: [{
        localId: 'local-1',
        file: createFile('a.txt'),
        datasetId: 'dataset-1',
        documentId: 'doc-1',
        status: 'processing',
        progress: 0,
        currentStage: 'uploaded',
      }],
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.cancel('local-1'));

    expect(cancelDocument).toHaveBeenCalledWith('doc-1');
    expect(result.current.items[0]).toMatchObject({ status: 'cancelled' });
  });

  it('refuses to cancel once the worker has picked the job up', async () => {
    useUploadStore.setState({
      items: [{
        localId: 'local-1',
        file: createFile('a.txt'),
        datasetId: 'dataset-1',
        documentId: 'doc-1',
        status: 'processing',
        progress: 30,
        currentStage: 'chunking',
      }],
    });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.cancel('local-1'));

    expect(cancelDocument).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({ status: 'processing' });
  });

  it('unsubscribes from the progress stream once every item settles', async () => {
    uploadDocument.mockResolvedValue({ documentId: 'doc-1', jobId: 'job-1', status: 'UPLOADED' });
    const { result } = renderHook(() => useUploadQueue());

    act(() => result.current.enqueue([createFile('a.txt')], 'dataset-1'));
    await vi.waitFor(() => expect(streamHandlers).toBeDefined());

    act(() => {
      streamHandlers?.onEvent({
        ownerId: 'user-1',
        documentId: 'doc-1',
        stage: 'ready',
        status: 'READY',
        completed: 1,
        total: 1,
        percent: 100,
      });
    });

    await vi.waitFor(() => expect(streamClosed).toBe(true));
  });
});
