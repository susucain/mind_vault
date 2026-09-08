import { DocumentProcessStatus } from '../types/api';

export function isRetryableIngestionStatus(
  status: DocumentProcessStatus | null | undefined,
): boolean {
  return status === 'FAILED' || status === 'UPLOADED';
}

export function ingestionStatusLabel(
  status: DocumentProcessStatus | null | undefined,
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
    case 'DELETED':
      return '已删除';
    default:
      return '等待解析';
  }
}
