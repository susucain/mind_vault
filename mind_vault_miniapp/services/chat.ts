import { environment } from '../config/env';
import { ChatMessage, ChatStreamMeta, Conversation } from '../types/chat';
import { request } from './request';
import { loadSession } from '../utils/session';
import { SseEvent, SseParser } from '../utils/sse';
import { recordRequestTrace } from '../utils/telemetry';

export interface StreamHandle {
  promise: Promise<void>;
  abort: () => void;
  isAborted: () => boolean;
}

export function createConversation(input: {
  title?: string;
  datasetIds: string[];
}) {
  return request<Conversation, typeof input>({
    path: '/conversations',
    method: 'POST',
    data: input,
  });
}

export function listConversations() {
  return request<{ items: Conversation[] }>({
    path: '/conversations',
  });
}

export function updateConversationDatasetScope(
  conversationId: string,
  datasetIds: string[]
) {
  return request<Conversation, { datasetIds: string[] }>({
    path: `/conversations/${conversationId}`,
    method: 'PATCH',
    data: { datasetIds },
  });
}

export function listMessages(conversationId: string) {
  return request<{ items: ChatMessage[] }>({
    path: `/conversations/${conversationId}/messages`,
  });
}

export function streamMessage(
  conversationId: string,
  content: string,
  onEvent: (event: SseEvent) => void
): StreamHandle {
  const session = loadSession();
  if (!session) {
    return {
      promise: Promise.reject(new Error('登录已失效')),
      abort: () => undefined,
      isAborted: () => false,
    };
  }
  const startedAt = Date.now();
  const path = `/conversations/${conversationId}/messages/stream`;
  // meta 在流式过程中到达，请求结束回调里才写记录，所以先攒着
  let lastMeta: ChatStreamMeta | null = null;
  let firstEventAt: number | undefined;
  let firstContentAt: number | undefined;
  let stageStartedAt: number | undefined;
  let activeStage: string | undefined;
  let citationStartedAt: number | undefined;
  let receivedDone = false;
  const stageDurationsMs: Record<string, number> = {};
  let recorded = false;
  const finishTrace = (
    finishReason: 'completed' | 'aborted' | 'failed',
    statusCode?: number,
    error?: string
  ) => {
    if (recorded) return;
    recorded = true;
    const finishedAt = Date.now();
    if (activeStage && stageStartedAt !== undefined) {
      stageDurationsMs[activeStage] = finishedAt - stageStartedAt;
    }
    recordRequestTrace({
      timestamp: finishedAt,
      method: 'POST',
      path,
      durationMs: finishedAt - startedAt,
      statusCode,
      error,
      ...streamUsage(),
      finishReason,
      firstEventDelayMs:
        firstEventAt === undefined ? undefined : firstEventAt - startedAt,
      firstContentDelayMs:
        firstContentAt === undefined ? undefined : firstContentAt - startedAt,
      stageDurationsMs,
      citationCompletionMs:
        citationStartedAt === undefined
          ? undefined
          : finishedAt - citationStartedAt,
    });
  };
  const handleEvent = (event: SseEvent) => {
    const receivedAt = Date.now();
    firstEventAt ??= receivedAt;
    if (event.event === 'meta' && isMetaEvent(event.data)) {
      lastMeta = event.data;
    }
    if (event.event === 'stage' && typeof event.data.stage === 'string') {
      if (activeStage && stageStartedAt !== undefined) {
        stageDurationsMs[activeStage] = receivedAt - stageStartedAt;
      }
      activeStage = event.data.stage;
      stageStartedAt = receivedAt;
    }
    if (event.event === 'token') firstContentAt ??= receivedAt;
    if (event.event === 'citation') citationStartedAt ??= receivedAt;
    if (event.event === 'done') {
      receivedDone = true;
      finishTrace('completed');
    }
    if (event.event === 'error') {
      finishTrace(
        'failed',
        undefined,
        typeof event.data.message === 'string' ? event.data.message : '问答失败'
      );
    }
    onEvent(event);
  };
  const streamUsage = () => ({
    usedTools: lastMeta?.usedTools,
    answerMode: lastMeta?.answerMode,
  });

  let requestTask: WechatMiniprogram.RequestTask | null = null;
  let aborted = false;
  const promise = new Promise<void>((resolve, reject) => {
    const parser = new SseParser();
    requestTask = wx.request({
      url: `${environment.apiBaseUrl}${path}`,
      timeout: environment.streamTimeout,
      method: 'POST',
      enableChunked: true,
      dataType: 'other',
      data: { content },
      header: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`问答请求失败：${response.statusCode}`);
          finishTrace('failed', response.statusCode, error.message);
          reject(error);
          return;
        }
        finishTrace(
          receivedDone ? 'completed' : 'failed',
          response.statusCode,
          receivedDone ? undefined : '流在完成事件前结束'
        );
        resolve();
      },
      fail(error) {
        if (aborted) {
          finishTrace('aborted');
          resolve();
          return;
        }
        const streamError = new Error(error.errMsg || '问答连接失败');
        finishTrace('failed', undefined, streamError.message);
        reject(streamError);
      },
    });
    requestTask.onChunkReceived((chunk) => {
      for (const event of parser.push(chunk.data)) {
        handleEvent(event);
      }
    });
  });
  return {
    promise,
    abort() {
      if (aborted) return;
      aborted = true;
      requestTask?.abort();
    },
    isAborted() {
      return aborted;
    },
  };
}

export function isMetaEvent(
  data: Record<string, unknown>
): data is ChatStreamMeta {
  return (
    typeof data.messageId === 'string' &&
    Array.isArray(data.usedTools) &&
    typeof data.thinking === 'boolean'
  );
}
