import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/errors';
import type { UploadDocumentResult } from '../api/documents';
import { useUploadQueue } from './use-upload-queue';
import { useUploadStore } from '../stores/upload.store';

const { uploadDocument, getDocumentStatus, retryDocument } = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  getDocumentStatus: vi.fn(),
  retryDocument: vi.fn(),
}));

vi.mock('../api/documents', () => ({ uploadDocument, getDocumentStatus, retryDocument }));

function createFile(name: string): File {
  return new File(['content'], name, { type: 'text/plain' });
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
});
