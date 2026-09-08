export interface RequestTrace {
  timestamp: number;
  method: string;
  path: string;
  durationMs: number;
  statusCode?: number;
  requestId?: string;
  error?: string;
}
