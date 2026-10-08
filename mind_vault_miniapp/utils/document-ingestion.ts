import { DocumentProcessStatus, GraphProgress } from '../types/api';

export function isRetryableIngestionStatus(
  status: DocumentProcessStatus | null | undefined
): boolean {
  return status === 'FAILED' || status === 'UPLOADED';
}

export function isTerminalIngestionStatus(
  status: DocumentProcessStatus | ''
): boolean {
  return (
    status === 'READY' ||
    status === 'FAILED' ||
    status === 'CANCELLED' ||
    status === 'DELETED'
  );
}

export function shouldShowMainIngestionProgress(
  status: DocumentProcessStatus | ''
): boolean {
  return Boolean(status) && !isTerminalIngestionStatus(status);
}

export function shouldShowGraphProgress(
  graph: GraphProgress | null | undefined
): boolean {
  return graph !== null && graph !== undefined;
}

export function buildUploadDisplayState(
  status: DocumentProcessStatus | '',
  graph: GraphProgress | null | undefined
) {
  return {
    showMainIngestionProgress: shouldShowMainIngestionProgress(status),
    showGraphProgress: shouldShowGraphProgress(graph),
  };
}

export function ingestionStatusLabel(
  status: DocumentProcessStatus | null | undefined
): string {
  switch (status) {
    case 'READY':
      return '解析完成';
    case 'FAILED':
      return '解析失败';
    case 'PARSING':
      return '正在解析';
    case 'PARSED':
      return '正在分块';
    case 'CHUNKING':
      return '正在分块';
    case 'EMBEDDING':
      return '正在向量化';
    case 'INDEXING':
      return '正在索引';
    case 'DELETING':
      return '正在删除';
    case 'CANCELLED':
      return '已取消';
    case 'DELETED':
      return '已删除';
    default:
      return '等待解析';
  }
}

export function graphStatusLabel(
  status: 'NOT_STARTED' | 'PROCESSING' | 'READY' | 'FAILED' | null | undefined
): string {
  switch (status) {
    case 'PROCESSING':
      return '图谱增强中';
    case 'READY':
      return '图谱完成';
    case 'FAILED':
      return '图谱部分失败';
    default:
      return '';
  }
}

export function formatRemainingSeconds(
  seconds: number | null | undefined
): string {
  if (seconds === null || seconds === undefined) return '正在估算';
  if (seconds < 60) return `预计 ${seconds} 秒`;
  return `预计 ${Math.ceil(seconds / 60)} 分钟`;
}
