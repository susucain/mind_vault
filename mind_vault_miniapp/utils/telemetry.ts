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
}

/**
 * 从本机请求记录里统计记忆注入与资料无依据的比例。
 * 只统计拿到 meta 的流式问答：没拿到 meta 的记录无从判断，混进来会把比例算偏。
 */
export function summarizeStreamUsage(traces: RequestTrace[]): StreamUsageSummary {
  const streams = traces.filter(
    (trace) =>
      trace.path.endsWith('/messages/stream') && Array.isArray(trace.usedTools)
  );
  return {
    total: streams.length,
    memoryInjected: streams.filter((trace) =>
      trace.usedTools?.includes('memory')
    ).length,
    generalAnswers: streams.filter((trace) => trace.answerMode === 'general')
      .length,
  };
}