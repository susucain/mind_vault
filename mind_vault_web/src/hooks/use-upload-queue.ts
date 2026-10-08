import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelDocument, getDocumentStatus, retryDocument, uploadDocument } from '../api/documents';
import { isApiError } from '../lib/errors';
import {
  connectDocumentProgress,
  type DocumentProgressEvent,
} from '../features/documents/document-progress-stream';
import type { DocumentGraphProgress } from '../types/domain';
import {
  canCancelUpload,
  useUploadStore,
  type DuplicateDocumentRef,
  type QueuedUpload,
} from '../stores/upload.store';

const MAX_CONCURRENT_UPLOADS = 3;
/** 并发字节闸门（U6）：在传 + 待启动字节合计上限，避免 100MB × 并发数 的内存峰值 */
const MAX_CONCURRENT_BYTES = 150 * 1024 * 1024;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
/** 轮询兜底间隔：仅在 SSE 不可用/断线期间真正发请求 */
const POLL_INTERVAL_MS = 2_000;
/** SSE 断线后的重连退避 */
const STREAM_RECONNECT_MS = 3_000;

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

/** 队列里仍需跟踪的服务端任务：正在处理，或已完成但图谱还在构建 */
function isTrackable(item: QueuedUpload): boolean {
  if (item.status === 'processing') return true;
  return item.status === 'ready' && item.graphProgress?.status === 'PROCESSING';
}

/** 进度快照：轮询响应与 SSE 事件都先归一到这个形状，再统一落到队列条目上 */
interface ProgressSource {
  status: string;
  currentStage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  stageProgress?: QueuedUpload['stageProgress'];
  graph?: DocumentGraphProgress | null;
  /** `graph` 是否可信：轮询/对账为 true；SSE 主阶段事件不带图状态，故为 false */
  graphKnown: boolean;
}

export function useUploadQueue() {
  const items = useUploadStore((state) => state.items);
  const add = useUploadStore((state) => state.add);
  const update = useUploadStore((state) => state.update);
  const remove = useUploadStore((state) => state.remove);
  const controllers = useRef(new Map<string, AbortController>());
  const pollers = useRef(new Map<string, number>());
  const streamReady = useRef(false);
  const reconnectTimer = useRef<number | undefined>(undefined);
  const [streamAttempt, setStreamAttempt] = useState(0);

  const stopPoller = useCallback((localId: string) => {
    const poller = pollers.current.get(localId);
    if (poller !== undefined) window.clearInterval(poller);
    pollers.current.delete(localId);
  }, []);

  /** 主流程已 READY 但事件不带图谱状态时，单次拉 status 对账（U5 的兜底） */
  const reconcileGraph = useCallback(async (localId: string, documentId: string) => {
    try {
      const status = await getDocumentStatus(documentId);
      const current = useUploadStore.getState().items.find((item) => item.localId === localId);
      if (!current) return;
      update(localId, {
        graphEnabled: status.graphEnabled ?? current.graphEnabled,
        graphProgress: status.graph ?? null,
      });
      if (status.graph?.status !== 'PROCESSING') stopPoller(localId);
    } catch {
      // 对账失败保持现状：后续图谱事件到达时会再更新
    }
  }, [stopPoller, update]);

  /** 把一份进度快照落到队列条目上；返回该条目是否已到终态（无需再跟踪） */
  const applyStatus = useCallback((documentId: string, source: ProgressSource): boolean => {
    const item = useUploadStore.getState().items.find((candidate) => candidate.documentId === documentId);
    if (!item) return true;
    const nextStatus = normalizeStatus(source.status);
    const graph = source.graph ?? null;
    const graphPending = graph?.status === 'PROCESSING';
    // SSE 主阶段事件不携带图状态：不知道图谱是否结束前先对账，别急着收尾
    const graphUnknown = !source.graphKnown && item.graphEnabled === true;
    const terminal =
      nextStatus === 'failed' ||
      nextStatus === 'cancelled' ||
      (nextStatus === 'ready' && !graphPending && !graphUnknown);
    update(item.localId, {
      status: nextStatus,
      currentStage: source.currentStage ?? undefined,
      progress: nextStatus === 'ready' ? 100 : (source.stageProgress?.percent ?? item.progress),
      stageProgress: source.stageProgress ?? item.stageProgress,
      graphProgress: source.graphKnown ? graph : item.graphProgress,
      failedStage: nextStatus === 'failed' ? source.currentStage ?? undefined : undefined,
      errorCode: source.errorCode ?? undefined,
      errorMessage: source.errorMessage ?? undefined,
    });
    if (nextStatus === 'ready' && graphUnknown && !graphPending) {
      void reconcileGraph(item.localId, documentId);
    }
    return terminal;
  }, [reconcileGraph, update]);

  const poll = useCallback((item: QueuedUpload) => {
    const check = async () => {
      const current = useUploadStore.getState().items.find(({ localId }) => localId === item.localId);
      if (!current || !current.documentId || !isTrackable(current)) {
        stopPoller(item.localId);
        return;
      }
      // SSE 在线时不再发请求：轮询只作为断线/不可用期间的兜底对账
      if (streamReady.current) return;
      try {
        const status = await getDocumentStatus(current.documentId);
        const settled = applyStatus(current.documentId, {
          status: status.status,
          currentStage: status.currentStage,
          errorCode: status.errorCode,
          errorMessage: status.errorMessage,
          stageProgress: status.stageProgress,
          graph: status.graph ?? null,
          graphKnown: true,
        });
        if (settled) stopPoller(item.localId);
      } catch (error) {
        update(current.localId, { status: 'failed', ...errorDetails(error) });
        stopPoller(item.localId);
      }
    };
    if (pollers.current.has(item.localId)) return;
    pollers.current.set(item.localId, window.setInterval(() => void check(), POLL_INTERVAL_MS));
  }, [applyStatus, stopPoller, update]);

  /** SSE 进度帧：图谱阶段与主阶段分开处理（图谱帧的 status 是图谱任务状态，不能当作文档状态） */
  const handleProgressEvent = useCallback((event: DocumentProgressEvent) => {
    const item = useUploadStore.getState().items.find((candidate) => candidate.documentId === event.documentId);
    if (!item) return;
    if (event.stage === 'graph') {
      const graph = event.graph ?? item.graphProgress ?? null;
      update(item.localId, { graphProgress: graph });
      if (graph?.status !== 'PROCESSING') stopPoller(item.localId);
      return;
    }
    const settled = applyStatus(event.documentId, {
      status: event.status,
      currentStage: event.stage,
      errorCode: event.errorCode,
      errorMessage: event.errorMessage,
      stageProgress: {
        completed: event.completed,
        total: event.total,
        percent: event.percent,
        estimatedRemainingSeconds: event.estimatedRemainingSeconds ?? null,
      },
      graph: null,
      graphKnown: false,
    });
    if (settled) stopPoller(item.localId);
  }, [applyStatus, stopPoller, update]);

  const startUpload = useCallback(async (item: QueuedUpload) => {
    const controller = new AbortController();
    controllers.current.set(item.localId, controller);
    update(item.localId, { status: 'uploading', progress: 0 });
    try {
      const response = await uploadDocument(
        item.file,
        { datasetId: item.datasetId, graphEnabled: item.graphEnabled },
        {
          signal: controller.signal,
          idempotencyKey: item.localId,
          onProgress: (percent) => {
            if (controller.signal.aborted) return;
            update(item.localId, { progress: percent });
          },
        },
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

  const hasTrackable = items.some(isTrackable);

  // U5：只要有任务在跑就订阅 owner 级进度流；全部结束后断开，不再空转
  useEffect(() => {
    if (!hasTrackable) return;
    let cancelled = false;
    const close = connectDocumentProgress({
      onEvent: handleProgressEvent,
      onOpen: () => {
        streamReady.current = true;
      },
      onClose: () => {
        streamReady.current = false;
        if (cancelled || reconnectTimer.current !== undefined) return;
        reconnectTimer.current = window.setTimeout(() => {
          reconnectTimer.current = undefined;
          setStreamAttempt((attempt) => attempt + 1);
        }, STREAM_RECONNECT_MS);
      },
    });
    return () => {
      cancelled = true;
      if (reconnectTimer.current !== undefined) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = undefined;
      }
      close();
      streamReady.current = false;
    };
  }, [hasTrackable, streamAttempt, handleProgressEvent]);

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
    if (!item || !canCancelUpload(item)) return;
    controllers.current.get(localId)?.abort();
    stopPoller(localId);
    update(localId, { status: 'cancelled' });
    // 服务端可能已经建好文档与 job：通知后端把尚未被 worker 接手的任务置为 CANCELLED
    if (item.documentId) {
      void cancelDocument(item.documentId).catch(() => undefined);
    }
  }, [stopPoller, update]);

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
          errorCode: undefined,
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
      errorCode: undefined,
      errorMessage: undefined,
      duplicateOf: undefined,
    });
  }, [poll, update]);

  const stopTracking = useCallback((localId: string) => {
    stopPoller(localId);
    remove(localId);
  }, [remove, stopPoller]);

  return { items, enqueue, cancel, retry, stopTracking };
}
