import type { Document, DocumentStatus } from '../../types/domain';

export const P0_EXTENSIONS = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'md', 'csv', 'json'] as const;

export function documentStatus(document: Document): DocumentStatus {
  if (typeof document.status === 'string') return document.status;
  if (document.status === 1) return 'ready';
  if (document.status === 2) return 'archived';
  if (document.status === 3) return 'failed';
  return 'processing';
}

export function documentStatusLabel(document: Document): string {
  const labels: Record<DocumentStatus, string> = {
    pending: '等待处理',
    uploading: '上传中',
    processing: '处理中',
    ready: '可问答',
    failed: '处理失败',
    archived: '已归档',
    deleted: '已删除',
  };
  return labels[documentStatus(document)];
}

export function documentTone(document: Document): 'neutral' | 'success' | 'warning' | 'danger' {
  const status = documentStatus(document);
  if (status === 'ready') return 'success';
  if (status === 'failed' || status === 'deleted') return 'danger';
  if (status === 'processing' || status === 'uploading' || status === 'pending') return 'warning';
  return 'neutral';
}

export function fileType(document: Document): string {
  return (document.sourceFileExtension ?? document.sourceFileName?.split('.').pop() ?? 'file')
    .replace(/^\./, '')
    .toLowerCase();
}

export function formatFileSize(value?: string | null): string {
  if (!value) return '未知大小';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function formatDate(value?: string): string {
  if (!value) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value));
}
