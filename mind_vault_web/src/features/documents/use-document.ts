import { useQuery } from '@tanstack/react-query';
import { getDocument, getDocumentStatus } from '../../api/documents';
import { appConfig } from '../../lib/config';
import type { Document } from '../../types/domain';

const mockDocument: Document = {
  id: 'mock-1',
  title: 'React 性能优化手册',
  summary: '围绕渲染、缓存、代码分割和性能度量整理的实践笔记。',
  status: 1,
  sourceFileName: 'react-performance.pdf',
  sourceFileExtension: 'pdf',
  sourceFileSize: '2840000',
  tags: '前端,性能,React',
  wordCount: 12480,
  pageCount: 32,
  createdAt: '2026-09-29T08:00:00Z',
  updatedAt: '2026-09-29T09:20:00Z',
  content: '## 渲染性能\n\n优先使用性能分析工具定位问题，再选择 memo、缓存或拆分组件。\n\n## 数据加载\n\n将服务端状态交给查询缓存管理。',
  sections: [
    { heading: '渲染性能', content: '优先使用性能分析工具定位问题。', locator: { page: 4 } },
    { heading: '演示文稿定位', content: '幻灯片来源示例。', locator: { slide: 7 } },
    { heading: '表格数据', content: '指标明细。', locator: { sheet: 'Q3', cellRange: 'B2:D8' } },
    { heading: '代码片段', content: '按行定位的文本。', locator: { lineStart: 12, lineEnd: 19 } },
    { heading: '结构化字段', content: 'JSON 字段定位。', locator: { jsonPath: '$.projects[0].name' } },
  ],
};

export function useDocument(documentId?: string) {
  return useQuery({
    enabled: Boolean(documentId),
    queryKey: ['documents', documentId],
    queryFn: () => appConfig.enableMockApi ? Promise.resolve({ ...mockDocument, id: documentId! }) : getDocument(documentId!),
  });
}

export function useDocumentStatus(documentId?: string) {
  return useQuery({
    enabled: Boolean(documentId),
    queryKey: ['documents', documentId, 'status'],
    queryFn: () => appConfig.enableMockApi
      ? Promise.resolve({
          documentId: documentId!,
          jobId: 'mock-job-1',
          status: 'READY',
          currentStage: 'ready',
          retryCount: 0,
          errorMessage: null,
          stageProgress: { completed: 5, total: 5, percent: 100, estimatedRemainingSeconds: null },
        })
      : getDocumentStatus(documentId!),
  });
}
