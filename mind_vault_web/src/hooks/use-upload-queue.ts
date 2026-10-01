import { useCallback, useEffect, useRef } from 'react';
import { getDocumentStatus, retryDocument, uploadDocument } from '../api/documents';
import { isApiError } from '../lib/errors';
import { useUploadStore, type QueuedUpload } from '../stores/upload.store';

const MAX_CONCURRENT_UPLOADS = 3;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'md', 'csv', 'json',
]);

function extension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `upload-${Date.now()}-${Math.random()}`;
}

function errorDetails(error: unknown): { failedStage?: string; errorMessage: string } {
  if (isApiError(error)) {
    const stage = typeof error.details?.stage === 'string' ? error.details.stage : undefined;
    return { failedStage: stage, errorMessage: error.message };
  }
  return { errorMessage: error instanceof Error ? error.message : 'Upload failed' };
}

function normalizeStatus(status: string): 'processing' | 'ready' | 'failed' | 'cancelled' {
  switch (status.toLowerCase()) {
    case 'ready':
      return 'ready';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'processing';
  }
}

export function useUploadQueue() {
  const items = useUploadStore((state) => state.items);
  const add = useUploadStore((state) => state.add);
  const update = useUploadStore((state) => state.update);
  const remove = useUploadStore((state) => state.remove);
  const controllers = useRef(new Map<string, AbortController>());
  const pollers = useRef(new Map<string, number>());

  const poll = useCallback((item: QueuedUpload) => {
    const stop = () => {
      const poller = pollers.current.get(item.localId);
      if (poller !== undefined) window.clearInterval(poller);
      pollers.current.delete(item.localId);
    };
    const check = async () => {
      const current = useUploadStore.getState().items.find(({ localId }) => localId === item.localId);
      if (!current || current.status !== 'processing' || !current.documentId) {
        stop();
        return;
      }
      try {
        const status = await getDocumentStatus(current.documentId);
        const nextStatus = normalizeStatus(status.status);
        if (nextStatus === 'ready' || nextStatus === 'failed' || nextStatus === 'cancelled') {
          update(current.localId, {
            status: nextStatus,
            progress: nextStatus === 'ready' ? 100 : current.progress,
            currentStage: status.currentStage ?? undefined,
            stageProgress: status.stageProgress,
            failedStage: nextStatus === 'failed' ? status.currentStage ?? undefined : undefined,
            errorMessage: status.errorMessage ?? undefined,
          });
          stop();
          return;
        }
        update(current.localId, {
          status: 'processing',
          currentStage: status.currentStage ?? undefined,
          progress: status.stageProgress.percent,
          stageProgress: status.stageProgress,
        });
      } catch (error) {
        const details = errorDetails(error);
        update(current.localId, { status: 'failed', ...details });
        stop();
      }
    };
    const poller = window.setInterval(() => void check(), 2_000);
    pollers.current.set(item.localId, poller);
  }, [update]);

  const startUpload = useCallback(async (item: QueuedUpload) => {
    const controller = new AbortController();
    controllers.current.set(item.localId, controller);
    update(item.localId, { status: 'uploading', progress: 0 });
    try {
      const response = await uploadDocument(item.file, { datasetId: item.datasetId }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      update(item.localId, {
        status: 'processing',
        documentId: response.documentId,
        progress: 0,
        currentStage: 'uploaded',
      });
      poll({ ...item, documentId: response.documentId, status: 'processing', progress: 0, currentStage: 'uploaded' });
    } catch (error) {
      if (controller.signal.aborted) return;
      update(item.localId, { status: 'failed', ...errorDetails(error) });
    } finally {
      controllers.current.delete(item.localId);
    }
  }, [poll, update]);

  useEffect(() => {
    const active = items.filter((item) => item.status === 'uploading').length;
    const available = MAX_CONCURRENT_UPLOADS - active;
    if (available <= 0) return;
    items
      .filter((item) => item.status === 'queued')
      .slice(0, available)
      .forEach((item) => void startUpload(item));
  }, [items, startUpload]);

  const enqueue = useCallback((files: File[], datasetId: string) => {
    const queued: QueuedUpload[] = files.map((file) => {
      let errorMessage: string | undefined;
      if (!ALLOWED_EXTENSIONS.has(extension(file))) errorMessage = `Unsupported file type: .${extension(file) || 'none'}`;
      if (file.size > MAX_FILE_SIZE) errorMessage = 'File exceeds the 100MB limit';
      return {
        localId: id(),
        file,
        datasetId,
        status: errorMessage ? 'failed' : 'queued',
        progress: 0,
        failedStage: errorMessage ? 'validation' : undefined,
        errorMessage,
      };
    });
    add(queued);
  }, [add]);

  const cancel = useCallback((localId: string) => {
    const item = useUploadStore.getState().items.find((candidate) => candidate.localId === localId);
    if (!item || item.status === 'processing') return;
    controllers.current.get(localId)?.abort();
    const poller = pollers.current.get(localId);
    if (poller !== undefined) window.clearInterval(poller);
    pollers.current.delete(localId);
    update(localId, { status: 'cancelled' });
  }, [update]);

  const retry = useCallback(async (localId: string) => {
    const item = useUploadStore.getState().items.find((candidate) => candidate.localId === localId);
    if (!item || item.status !== 'failed') return;
    if (item.documentId) {
      try {
        await retryDocument(item.documentId);
        const next = {
          ...item,
          status: 'processing' as const,
          progress: 0,
          currentStage: 'retry_pending',
          stageProgress: undefined,
          failedStage: undefined,
          errorMessage: undefined,
        };
        update(localId, next);
        poll(next);
      } catch (error) {
        update(localId, { status: 'failed', ...errorDetails(error) });
      }
      return;
    }
    update(localId, {
      status: 'queued',
      progress: 0,
      currentStage: undefined,
      stageProgress: undefined,
      failedStage: undefined,
      errorMessage: undefined,
    });
  }, [poll, update]);

  const stopTracking = useCallback((localId: string) => {
    const poller = pollers.current.get(localId);
    if (poller !== undefined) window.clearInterval(poller);
    pollers.current.delete(localId);
    remove(localId);
  }, [remove]);

  return { items, enqueue, cancel, retry, stopTracking };
}
