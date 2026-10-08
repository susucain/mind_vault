import { useCallback, useEffect, useRef } from 'react';
import { getDocumentStatus, retryDocument, uploadDocument } from '../api/documents';
import { isApiError } from '../lib/errors';
import { useUploadStore, type DuplicateDocumentRef, type QueuedUpload } from '../stores/upload.store';

const MAX_CONCURRENT_UPLOADS = 3;
/** 并发字节闸门（U6）：在传 + 待启动字节合计上限，避免 100MB × 并发数 的内存峰值 */
const MAX_CONCURRENT_BYTES = 150 * 1024 * 1024;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function extension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `upload-${Date.now()}-${Math.random()}`;
}

/** 从 409 的 details 中解析既有文档引用（U3），字段不合法时返回 undefined */
function duplicateOf(details: Record<string, unknown> | undefined): DuplicateDocumentRef | undefined {
  const value = details?.duplicateOf;
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return undefined;
  return {
    id: candidate.id,
    name: candidate.name,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
  };
}

function errorDetails(error: unknown): {
  failedStage?: string;
  errorMessage: string;
  duplicateOf?: DuplicateDocumentRef;
} {
  if (isApiError(error)) {
    const stage = typeof error.details?.stage === 'string' ? error.details.stage : undefined;
    return {
      failedStage: stage,
      errorMessage: error.message,
      duplicateOf: duplicateOf(error.details),
    };
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
      if (!current || !current.documentId || (current.status !== 'processing' && current.status !== 'ready')) {
        stop();
        return;
      }
      try {
        const status = await getDocumentStatus(current.documentId);
        const nextStatus = normalizeStatus(status.status);
        // 图谱在 job 进入 READY 之后仍在后台构建，此时 `status.graph` 仍为 PROCESSING；
        // 需要继续轮询，否则队列会在图谱还没建完时就停止跟踪。
        const graph = status.graph ?? null;
        const graphPending = graph?.status === 'PROCESSING';
        if (nextStatus === 'failed' || nextStatus === 'cancelled' || (nextStatus === 'ready' && !graphPending)) {
          update(current.localId, {
            status: nextStatus,
            progress: nextStatus === 'ready' ? 100 : current.progress,
            currentStage: status.currentStage ?? undefined,
            stageProgress: status.stageProgress,
            graphProgress: graph,
            failedStage: nextStatus === 'failed' ? status.currentStage ?? undefined : undefined,
            errorMessage: status.errorMessage ?? undefined,
          });
          stop();
          return;
        }
        update(current.localId, {
          status: nextStatus === 'ready' ? 'ready' : 'processing',
          currentStage: status.currentStage ?? undefined,
          progress: nextStatus === 'ready' ? 100 : status.stageProgress.percent,
          stageProgress: status.stageProgress,
          graphProgress: graph,
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
      const response = await uploadDocument(
        item.file,
        { datasetId: item.datasetId, graphEnabled: item.graphEnabled },
        { signal: controller.signal, idempotencyKey: item.localId },
      );
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
    // 双闸门（U6）：并发文件数 ≤3 **且** 在传 + 待启动字节 ≤150MB。
    // 超出字节闸门的大文件保持 queued（UI 显示「排队中」），自动串行等待，避免内存峰值叠加。
    const active = items.filter((item) => item.status === 'uploading');
    let fileSlots = MAX_CONCURRENT_UPLOADS - active.length;
    let byteBudget = MAX_CONCURRENT_BYTES - active.reduce((sum, item) => sum + item.file.size, 0);
    if (fileSlots <= 0 || byteBudget <= 0) return;
    items
      .filter((item) => item.status === 'queued')
      .forEach((item) => {
        if (fileSlots <= 0) return;
        if (item.file.size > byteBudget) return;
        fileSlots -= 1;
        byteBudget -= item.file.size;
        void startUpload(item);
      });
  }, [items, startUpload]);

  const enqueue = useCallback((files: File[], datasetId: string, options: { graphEnabled?: boolean; extensions?: string[] } = {}) => {
    const graphEnabled = options.graphEnabled ?? false;
    // 白名单由服务端下发（老格式取决于 soffice 是否可用）；未取到时不拦截，交由服务端校验
    const allowed = options.extensions?.length
      ? new Set(options.extensions.map((item) => item.toLowerCase()))
      : undefined;
    const queued: QueuedUpload[] = files.map((file) => {
      let errorMessage: string | undefined;
      if (allowed && !allowed.has(extension(file))) errorMessage = `不支持的文件格式：.${extension(file) || '未知'}`;
      if (file.size > MAX_FILE_SIZE) errorMessage = '文件超过 100MB 上限';
      return {
        localId: id(),
        file,
        datasetId,
        graphEnabled,
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
      duplicateOf: undefined,
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
