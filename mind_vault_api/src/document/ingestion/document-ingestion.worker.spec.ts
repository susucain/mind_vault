/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { DocumentIngestionWorker } from './document-ingestion.worker';
import { IngestionJobStatus } from '../entities/document-ingestion-job.entity';

describe('DocumentIngestionWorker', () => {
  it('parses the uploaded source and marks the job as parsed', async () => {
    const jobs = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job_1',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        status: IngestionJobStatus.Uploaded,
        currentStage: 'uploaded',
        retryCount: 0,
        save: jest.fn(),
      }),
      save: jest.fn(async (job) => job),
    };
    const documents = {
      findOne: jest.fn().mockResolvedValue({
        id: 'doc_1',
        ownerId: 'user_1',
        sourceFileName: 'notes.md',
        sourceFileKey: null,
        contentId: 'content_1',
      }),
    };
    const contents = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          sourceBytes: Buffer.from('# 标题\n正文'),
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const parser = {
      parseStructured: jest.fn().mockResolvedValue({
        title: 'notes.md',
        format: 'md',
        rawText: '# 标题\n正文',
        sections: [
          {
            sectionId: 'section_0001',
            heading: '标题',
            text: '标题\n正文',
            order: 0,
            locator: { lineStart: 1 },
          },
        ],
        assets: [],
      }),
    };
    const storage = {
      downloadBytes: jest.fn(),
    };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      documents as never,
      contents as never,
      parser as never,
      storage as never,
      { get: jest.fn().mockReturnValue(false) } as never,
      { chunk: jest.fn().mockReturnValue([]) } as never,
      { embedDocuments: jest.fn().mockResolvedValue([]) } as never,
      { indexChunks: jest.fn().mockResolvedValue(undefined) } as never,
      {
        extract: jest.fn().mockResolvedValue({ entities: [], relations: [] }),
      } as never,
      { indexChunk: jest.fn().mockResolvedValue(undefined) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
    );

    await expect(
      worker.process({
        jobId: 'job_1',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        operation: 'index',
      }),
    ).resolves.toMatchObject({
      status: IngestionJobStatus.Ready,
      documentId: 'doc_1',
    });

    expect(parser.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: 'notes.md',
        buffer: Buffer.from('# 标题\n正文'),
      }),
    );
    expect(contents.updateOne).toHaveBeenCalledWith(
      { _id: 'content_1', deleted: false },
      expect.objectContaining({
        $set: expect.objectContaining({
          content: '# 标题\n正文',
          pageCount: 0,
        }),
      }),
    );
  });

  it('downloads from RustFS when a source mirror is unavailable', async () => {
    const jobs = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job_1',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        status: IngestionJobStatus.Uploaded,
        retryCount: 0,
      }),
      save: jest.fn(async (job) => job),
    };
    const storage = {
      downloadBytes: jest.fn().mockResolvedValue(Buffer.from('# RustFS source')),
    };
    const parser = {
      parseStructured: jest.fn().mockResolvedValue({
        rawText: '# RustFS source',
        sections: [],
        assets: [],
      }),
    };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'doc_1',
          ownerId: 'user_1',
          sourceFileName: 'large.pdf',
          sourceFileKey: 'users/user_1/documents/large.pdf',
          contentId: 'content_1',
        }),
      } as never,
      {
        findOne: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({}),
        }),
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      } as never,
      parser as never,
      storage as never,
      { get: jest.fn().mockReturnValue(true) } as never,
      { chunk: jest.fn().mockReturnValue([]) } as never,
      { embedDocuments: jest.fn().mockResolvedValue([]) } as never,
      { indexChunks: jest.fn().mockResolvedValue(undefined) } as never,
      {
        extract: jest.fn().mockResolvedValue({ entities: [], relations: [] }),
      } as never,
      { indexChunk: jest.fn().mockResolvedValue(undefined) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
    );

    await worker.process({
      jobId: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'index',
    });

    expect(storage.downloadBytes).toHaveBeenCalledWith(
      'users/user_1/documents/large.pdf',
    );
    expect(parser.parseStructured).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: Buffer.from('# RustFS source') }),
    );
  });

  it('deletes source storage and external indexes for a deletion job', async () => {
    const job = {
      id: 'job_delete',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'delete',
      status: 'DELETING',
      currentStage: 'deleting',
      retryCount: 0,
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn().mockResolvedValue(job),
    };
    const storage = {
      isEnabled: jest.fn().mockReturnValue(true),
      deleteObject: jest.fn(),
    };
    const index = { deleteByDocument: jest.fn().mockResolvedValue(undefined) };
    const graph = { deleteDocument: jest.fn().mockResolvedValue(undefined) };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'doc_1',
          ownerId: 'user_1',
          sourceFileKey: 'users/user_1/doc_1.pdf',
        }),
      } as never,
      {} as never,
      {} as never,
      storage as never,
      { get: jest.fn().mockReturnValue(false) } as never,
      {} as never,
      {} as never,
      index as never,
      {} as never,
      graph as never,
      {} as never,
    );

    await expect(
      worker.process({
        jobId: 'job_delete',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        operation: 'delete',
      }),
    ).resolves.toMatchObject({ status: 'DELETED' });
    expect(storage.deleteObject).toHaveBeenCalledWith('users/user_1/doc_1.pdf');
    expect(index.deleteByDocument).toHaveBeenCalledWith('user_1', 'doc_1');
    expect(graph.deleteDocument).toHaveBeenCalledWith('user_1', 'doc_1');
  });

  it('skips a deletion job that already finished', async () => {
    const job = {
      id: 'job_delete',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'delete',
      status: IngestionJobStatus.Deleted,
      currentStage: 'deleted',
      retryCount: 0,
    };
    const storage = {
      isEnabled: jest.fn().mockReturnValue(true),
      deleteObject: jest.fn(),
    };
    const index = { deleteByDocument: jest.fn().mockResolvedValue(undefined) };
    const graph = { deleteDocument: jest.fn().mockResolvedValue(undefined) };
    const worker = new DocumentIngestionWorker(
      { findOne: jest.fn().mockResolvedValue(job), save: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      {} as never,
      {} as never,
      storage as never,
      { get: jest.fn().mockReturnValue(false) } as never,
      {} as never,
      {} as never,
      index as never,
      {} as never,
      graph as never,
      {} as never,
    );

    await expect(
      worker.process({
        jobId: 'job_delete',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        operation: 'delete',
      }),
    ).resolves.toMatchObject({
      status: IngestionJobStatus.Deleted,
      skipped: true,
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(index.deleteByDocument).not.toHaveBeenCalled();
    expect(graph.deleteDocument).not.toHaveBeenCalled();
  });

  it('clears the existing index before rebuilding for a reindex job', async () => {
    const job = {
      id: 'job_reindex',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'reindex',
      status: IngestionJobStatus.Uploaded,
      currentStage: 'reindex_pending',
      retryCount: 0,
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn(async (entity) => entity),
    };
    const index = {
      deleteByDocument: jest.fn().mockResolvedValue(undefined),
      indexChunks: jest.fn().mockResolvedValue(undefined),
    };
    const graph = {
      deleteDocument: jest.fn().mockResolvedValue(undefined),
      indexChunk: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'doc_1',
          ownerId: 'user_1',
          title: 'notes.md',
          sourceFileName: 'notes.md',
          sourceFileKey: null,
          contentId: 'content_1',
        }),
      } as never,
      {
        findOne: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            sourceBytes: Buffer.from('# 标题\n正文'),
          }),
        }),
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      } as never,
      {
        parseStructured: jest.fn().mockResolvedValue({
          title: 'notes.md',
          format: 'md',
          rawText: '# 标题\n正文',
          sections: [
            {
              sectionId: 'section_0001',
              heading: '标题',
              text: '标题\n正文',
              order: 0,
              locator: { lineStart: 1 },
            },
          ],
          assets: [],
        }),
      } as never,
      { downloadBytes: jest.fn() } as never,
      { get: jest.fn().mockReturnValue(false) } as never,
      {
        chunk: jest
          .fn()
          .mockReturnValue([
            { chunkId: 'chunk_1', text: '标题\n正文', documentId: 'doc_1' },
          ]),
      } as never,
      { embedDocuments: jest.fn().mockResolvedValue([[0.1, 0.2]]) } as never,
      index as never,
      {
        extract: jest.fn().mockResolvedValue({ entities: [], relations: [] }),
      } as never,
      graph as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
    );

    await expect(
      worker.process({
        jobId: 'job_reindex',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        operation: 'reindex',
      }),
    ).resolves.toMatchObject({ status: IngestionJobStatus.Ready });

    expect(index.deleteByDocument).toHaveBeenCalledWith('user_1', 'doc_1');
    expect(graph.deleteDocument).toHaveBeenCalledWith('user_1', 'doc_1');
    expect(index.deleteByDocument.mock.invocationCallOrder[0]).toBeLessThan(
      index.indexChunks.mock.invocationCallOrder[0],
    );
  });
});
