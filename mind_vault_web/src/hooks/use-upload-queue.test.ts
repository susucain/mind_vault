import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/errors';
import type { Document } from '../types/domain';
import { useUploadQueue } from './use-upload-queue';
import { useUploadStore } from '../stores/upload.store';

const { uploadDocument, getDocumentStatus } = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  getDocumentStatus: vi.fn(),
}));

vi.mock('../api/documents', () => ({ uploadDocument, getDocumentStatus }));

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
    useUploadStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs at most three uploads and starts queued work after an upload completes', async () => {
    const uploads = Array.from({ length: 4 }, () => deferred<Document>());
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
      uploads[0]?.resolve({ id: 'doc-1' } as Document);
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
    uploadDocument.mockRejectedValue(
      new ApiRequestError({
        status: 422,
        code: 'UPLOAD_FAILED',
        message: 'parser failed',
        details: { stage: 'parsing' },
      }),
    );
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

    act(() => result.current.retry(result.current.items[0].localId));

    await vi.waitFor(() =>
      expect(uploadDocument).toHaveBeenCalledTimes(2),
    );
    expect(result.current.items[0]).toMatchObject({ status: 'uploading', failedStage: undefined });
  });
});
