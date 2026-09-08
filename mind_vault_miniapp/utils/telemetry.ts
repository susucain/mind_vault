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
