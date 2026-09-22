import { RequestTrace } from '../types/telemetry';

const TRACE_KEY = 'mind-vault-request-traces';
const MAX_TRACE_COUNT = 50;

export function recordRequestTrace(trace: RequestTrace) {
  const current = wx.getStorageSync(TRACE_KEY) as RequestTrace[] | undefined;
  const traces = Array.isArray(current) ? current : [];
  traces.unshift(trace);
  wx.setStorageSync(TRACE_KEY, traces.slice(0, MAX_TRACE_COUNT));
}

export function getRequestTraces() {
  const traces = wx.getStorageSync(TRACE_KEY);
  return Array.isArray(traces) ? (traces as RequestTrace[]) : [];
}

export interface StreamUsageSummary {
  total: number;
  memoryInjected: number;
  generalAnswers: number;
  completed: number;
  aborted: number;
  failed: number;
  averageDurationMs: number;
}

/**
 * 从本机请求记录里统计记忆注入与资料无依据的比例。
 * 所有流式问答都计入总量与完成状态；仅在拿到 meta 时统计记忆注入与通用回答。
 */
export function summarizeStreamUsage(
  traces: RequestTrace[]
): StreamUsageSummary {
  const streams = traces.filter((trace) =>
    trace.path.endsWith('/messages/stream')
  );
  return {
    total: streams.length,
    memoryInjected: streams.filter((trace) =>
      trace.usedTools?.includes('memory')
    ).length,
    generalAnswers: streams.filter((trace) => trace.answerMode === 'general')
      .length,
    completed: streams.filter((trace) => trace.finishReason === 'completed')
      .length,
    aborted: streams.filter((trace) => trace.finishReason === 'aborted').length,
    failed: streams.filter((trace) => trace.finishReason === 'failed').length,
    averageDurationMs:
      streams.length === 0
        ? 0
        : Math.round(
            streams.reduce((total, trace) => total + trace.durationMs, 0) /
              streams.length
          ),
  };
}
