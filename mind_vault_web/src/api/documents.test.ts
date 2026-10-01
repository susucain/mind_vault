import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDocument, getDocumentStatus, listDocuments, uploadDocument } from './documents';

describe('document API contracts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('normalizes ParsedSection.text from the document detail response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'doc-1',
      title: 'Backend fixture',
      status: 1,
      content: '# Backend fixture',
      pageCount: 3,
      sections: [{
        sectionId: 'section-1',
        heading: '真实章节',
        text: '来自 parsed-document.ts 的 text 字段',
        order: 0,
        locator: { page: 2, lineStart: 8, lineEnd: 12 },
      }],
    }), { headers: { 'Content-Type': 'application/json' } }));

    await expect(getDocument('doc-1')).resolves.toMatchObject({
      sections: [{
        sectionId: 'section-1',
        content: '来自 parsed-document.ts 的 text 字段',
        order: 0,
        locator: { page: 2, lineStart: 8, lineEnd: 12 },
      }],
    });
  });

  it('preserves the backend status stageProgress contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      documentId: 'doc-1',
      jobId: 'job-1',
      status: 'CHUNKING',
      currentStage: 'chunking',
      retryCount: 0,
      errorCode: null,
      errorMessage: null,
      stageProgress: {
        completed: 3,
        total: 10,
        percent: 30,
        estimatedRemainingSeconds: 14,
        stageStartedAt: '2026-09-30T08:00:00.000Z',
      },
      graph: null,
    }), { headers: { 'Content-Type': 'application/json' } }));

    await expect(getDocumentStatus('doc-1')).resolves.toMatchObject({
      currentStage: 'chunking',
      stageProgress: { completed: 3, total: 10, percent: 30 },
    });
  });

  it('forwards AbortSignal during upload without inventing progress events', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      documentId: 'doc-1',
      jobId: 'job-1',
      status: 'UPLOADED',
    }), { headers: { 'Content-Type': 'application/json' } }));
    const controller = new AbortController();

    await uploadDocument(new File(['content'], 'notes.md'), { datasetId: 'dataset-1' }, {
      signal: controller.signal,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.signal).toBe(controller.signal);
  });

  it('sends only supported server filters and pagination to the document list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [],
      total: 0,
      page: 2,
      pageSize: 10,
    }), { headers: { 'Content-Type': 'application/json' } }));

    await listDocuments({ title: '缓存 策略', datasetId: 'dataset-1', page: 2, pageSize: 10 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/v1/documents?title=%E7%BC%93%E5%AD%98+%E7%AD%96%E7%95%A5&datasetId=dataset-1&page=2&pageSize=10',
    );
  });
});
