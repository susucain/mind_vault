import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getDocument,
  getDocumentOutline,
  getDocumentSections,
  getDocumentStatus,
} from '../../api/documents';
import type { DocumentSectionPageParam } from '../../api/documents';
import { appConfig } from '../../lib/config';
import type { Document, DocumentOutline, DocumentSection, DocumentSectionPage } from '../../types/domain';

/** 每页正文块数，与后端默认值一致 */
export const SECTION_PAGE_SIZE = 10;

const mockSections: DocumentSection[] = [
  { sectionId: 'section-1', heading: '渲染性能', content: '优先使用性能分析工具定位问题。', order: 0, locator: { page: 4 } },
  { sectionId: 'section-2', heading: '演示文稿定位', content: '幻灯片来源示例。', order: 1, locator: { slide: 7 } },
  { sectionId: 'section-3', heading: '表格数据', content: '指标明细。', order: 2, locator: { sheet: 'Q3', cellRange: 'B2:D8' } },
  { sectionId: 'section-4', heading: '代码片段', content: '按行定位的文本。', order: 3, locator: { lineStart: 12, lineEnd: 19 } },
  { sectionId: 'section-5', heading: '结构化字段', content: 'JSON 字段定位。', order: 4, locator: { jsonPath: '$.projects[0].name' } },
];

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
  sections: mockSections,
};

function mockOutline(documentId: string): DocumentOutline {
  return {
    documentId,
    title: mockDocument.title,
    pageCount: mockDocument.pageCount ?? 0,
    totalSections: mockSections.length,
    sections: mockSections.map(({ sectionId, heading, order, locator }) => ({ sectionId, heading, order, locator })),
  };
}

function mockSectionPage(param: DocumentSectionPageParam): DocumentSectionPage {
  const limit = param.limit ?? SECTION_PAGE_SIZE;
  const start = param.cursor === undefined ? 0 : param.cursor + 1;
  const items = mockSections.slice(start, start + limit);
  const hasMore = start + items.length < mockSections.length;
  return {
    items,
    nextCursor: hasMore && items.length ? items[items.length - 1].order ?? null : null,
    total: mockSections.length,
  };
}

/** 反向窗口：请求目标页之前的 `pageSize` 块；不足一页时退回首块。 */
function previousSectionParam(
  page: DocumentSectionPage,
  pageSize: number,
): DocumentSectionPageParam | undefined {
  const firstOrder = page.items[0]?.order;
  if (firstOrder === undefined || firstOrder === 0) return undefined;
  const cursor = firstOrder - pageSize - 1;
  return cursor >= 0
    ? { cursor, limit: pageSize }
    : { cursor: undefined, limit: firstOrder };
}

/**
 * 游标语义为「已取到的最后一个 order」（后端按 `cursor + 1` 起取），
 * 故要从某个正文块起步需回退一位；为 0 或未指定时从头取首页。
 */
function pageCursorForOrder(order?: number): number | undefined {
  return order && order > 0 ? order - 1 : undefined;
}

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

/** 大纲：用于目录渲染与深链定位（不含正文，体积小）。 */
export function useDocumentOutline(documentId?: string) {
  return useQuery({
    enabled: Boolean(documentId),
    queryKey: ['documents', documentId, 'outline'],
    queryFn: () => appConfig.enableMockApi
      ? Promise.resolve(mockOutline(documentId!))
      : getDocumentOutline(documentId!),
  });
}

export interface DocumentSectionsOptions {
  /** 深链定位 / 目录跳转：从该正文块 `order` 起取首页（含该块本身） */
  startOrder?: number;
  enabled?: boolean;
}

/** 正文分页：双向无限查询（触底取下一页，目录上滑取更早内容）。 */
export function useDocumentSections(
  documentId?: string,
  options: DocumentSectionsOptions = {},
) {
  const { startOrder, enabled = true } = options;
  return useInfiniteQuery({
    enabled: Boolean(documentId) && enabled,
    queryKey: ['documents', documentId, 'sections', startOrder ?? null],
    initialPageParam: {
      cursor: pageCursorForOrder(startOrder),
      limit: SECTION_PAGE_SIZE,
    } as DocumentSectionPageParam,
    queryFn: ({ pageParam }) => appConfig.enableMockApi
      ? Promise.resolve(mockSectionPage(pageParam))
      : getDocumentSections(documentId!, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor === null
      ? undefined
      : { cursor: lastPage.nextCursor, limit: SECTION_PAGE_SIZE },
    getPreviousPageParam: (firstPage) => previousSectionParam(firstPage, SECTION_PAGE_SIZE),
  });
}
