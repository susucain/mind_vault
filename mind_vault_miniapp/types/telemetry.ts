export interface RequestTrace {
  timestamp: number;
  method: string;
  path: string;
  durationMs: number;
  statusCode?: number;
  requestId?: string;
  error?: string;
  /** 流式问答拿到 meta 后记录，用于统计记忆注入与资料无依据的比例 */
  usedTools?: string[];
  answerMode?: string;
}