/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { DocumentIngestionWorker } from './document-ingestion.worker';
import { IngestionJobStatus } from '../entities/document-ingestion-job.entity';
import { connect } from 'amqplib';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('DocumentIngestionWorker', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('marks an abandoned active job as failed so it can be retried', async () => {
    const staleJob = {
      id: 'job_stale',
      ownerId: 'user_1',
      documentId: 'doc_1',
      status: IngestionJobStatus.Indexing,
      currentStage: 'indexing',
      retryCount: 0,
      updatedAt: new Date(Date.now() - 41 * 60_000),
      lastHeartbeatAt: null,
    };
    const jobs = {
      find: jest.fn().mockResolvedValue([staleJob]),
      save: jest.fn().mockResolvedValue(staleJob),
    };
    const documents = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      documents as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const internals = worker as unknown as {
      failStaleJobs: () => Promise<void>;
    };
    await internals.failStaleJobs();

    expect(staleJob).toMatchObject({
      status: IngestionJobStatus.Failed,
      errorCode: 'WORKER_TIMEOUT',
      errorMessage: '任务超时或 worker 中断，请重试',
    });
    expect(documents.update).toHaveBeenCalledWith(
      { id: 'doc_1', ownerId: 'user_1', deleted: false },
      { status: 3 },
    );
  });

  it('republishes an uploaded job that was never consumed instead of failing it', async () => {
    const staleJob = {
      id: 'job_pending',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'index',
      status: IngestionJobStatus.Uploaded,
      currentStage: 'uploaded',
      retryCount: 0,
      updatedAt: new Date(Date.now() - 41 * 60_000),
      lastHeartbeatAt: null,
    };
    const jobs = {
      find: jest.fn().mockResolvedValue([staleJob]),
      save: jest.fn().mockResolvedValue(staleJob),
    };
    const documents = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const publisher = { publishIndex: jest.fn().mockResolvedValue(undefined) };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      documents as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      publisher as never,
    );

    const internals = worker as unknown as {
      failStaleJobs: () => Promise<void>;
    };
    await internals.failStaleJobs();

    expect(publisher.publishIndex).toHaveBeenCalledWith({
      jobId: 'job_pending',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'index',
    });
    expect(staleJob).toMatchObject({
      status: IngestionJobStatus.Uploaded,
      retryCount: 1,
    });
    expect(documents.update).not.toHaveBeenCalled();
  });

  it('fails an uploaded job after its republish budget is exhausted', async () => {
    const staleJob = {
      id: 'job_pending',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'index',
      status: IngestionJobStatus.Uploaded,
      currentStage: 'uploaded',
      retryCount: 1,
      updatedAt: new Date(Date.now() - 41 * 60_000),
      lastHeartbeatAt: null,
    };
    const jobs = {
      find: jest.fn().mockResolvedValue([staleJob]),
      save: jest.fn().mockResolvedValue(staleJob),
    };
    const documents = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const publisher = {
      publishIndex: jest.fn().mockResolvedValue(undefined),
      publishProgress: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      documents as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      publisher as never,
    );

    const internals = worker as unknown as {
      failStaleJobs: () => Promise<void>;
    };
    await internals.failStaleJobs();

    expect(publisher.publishIndex).not.toHaveBeenCalled();
    expect(staleJob).toMatchObject({
      status: IngestionJobStatus.Failed,
      errorCode: 'WORKER_TIMEOUT',
    });
  });

  it('reconnects and resumes consumption after its channel closes', async () => {
    jest.useFakeTimers();
    const firstConnectionHandlers = new Map<string, () => void>();
    const firstChannelHandlers = new Map<string, () => void>();
    const firstChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      prefetch: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      on: jest.fn((event: string, handler: () => void) => {
        firstChannelHandlers.set(event, handler);
      }),
    };
    const firstConnection = {
      createChannel: jest.fn().mockResolvedValue(firstChannel),
      on: jest.fn((event: string, handler: () => void) => {
        firstConnectionHandlers.set(event, handler);
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const secondChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      prefetch: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const secondConnection = {
      createChannel: jest.fn().mockResolvedValue(secondChannel),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connectMock = connect as jest.MockedFunction<typeof connect>;
    connectMock
      .mockResolvedValueOnce(firstConnection as never)
      .mockResolvedValueOnce(secondConnection as never);
    const worker = new DocumentIngestionWorker(
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        get: jest.fn((key: string) =>
          key === 'ingestion.workerEnabled'
            ? true
            : 'amqp://guest:guest@localhost:5672',
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await worker.onModuleInit();
    firstChannelHandlers.get('close')?.();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(secondConnection.createChannel).toHaveBeenCalledTimes(1);
    expect(secondChannel.prefetch).toHaveBeenCalledWith(1);
    expect(secondChannel.consume).toHaveBeenCalledWith(
      'mind-vault.ingestion.worker',
      expect.any(Function),
    );
    expect(firstConnectionHandlers.get('close')).toBeDefined();
    await worker.onModuleDestroy();
  });

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
      update: jest.fn().mockResolvedValue({ affected: 1 }),
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
    expect(documents.update).toHaveBeenCalledWith(
      { id: 'doc_1', ownerId: 'user_1', deleted: false },
      { status: 1 },
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
      downloadBytes: jest
        .fn()
        .mockResolvedValue(Buffer.from('# RustFS source')),
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
        update: jest.fn().mockResolvedValue({ affected: 1 }),
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

  it('publishes a failed embedding snapshot when the model rejects the request', async () => {
    const job = {
      id: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      status: IngestionJobStatus.Uploaded,
      currentStage: 'uploaded',
      retryCount: 0,
      stageCompleted: 0,
      stageTotal: 0,
    };
    const publisher = {
      publishProgress: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new DocumentIngestionWorker(
      {
        findOne: jest.fn().mockResolvedValue(job),
        save: jest.fn(async (entity) => entity),
      } as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'doc_1',
          ownerId: 'user_1',
          sourceFileName: 'notes.md',
          sourceFileKey: null,
          contentId: 'content_1',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
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
          rawText: '# 标题\n正文',
          sections: [],
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
      {
        embedDocuments: jest
          .fn()
          .mockRejectedValue(new Error('429 MODEL_RATE_LIMIT')),
      } as never,
      { indexChunks: jest.fn() } as never,
      { extract: jest.fn() } as never,
      { indexChunk: jest.fn() } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      undefined,
      publisher as never,
    );

    await expect(
      worker.process({
        jobId: 'job_1',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        operation: 'index',
      }),
    ).rejects.toThrow('429 MODEL_RATE_LIMIT');

    expect(job).toMatchObject({
      status: IngestionJobStatus.Failed,
      currentStage: 'embedding',
      errorCode: 'EMBEDDING_FAILED',
      errorMessage: '429 MODEL_RATE_LIMIT',
    });
    expect(publisher.publishProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documentId: 'doc_1',
        stage: 'embedding',
        status: IngestionJobStatus.Failed,
        errorCode: 'EMBEDDING_FAILED',
        errorMessage: '429 MODEL_RATE_LIMIT',
      }),
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
    const graphTasks = {
      cancelActiveTasks: jest.fn().mockResolvedValue(undefined),
      enqueue: jest.fn().mockResolvedValue(undefined),
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
          graphEnabled: true,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
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
      graphTasks as never,
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
    expect(graphTasks.cancelActiveTasks).toHaveBeenCalledWith(
      'user_1',
      'doc_1',
    );
    expect(graphTasks.enqueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ chunkId: 'chunk_1', documentId: 'doc_1' }),
      ]),
    );
    expect(index.deleteByDocument.mock.invocationCallOrder[0]).toBeLessThan(
      index.indexChunks.mock.invocationCallOrder[0],
    );
  });

  it('skips graph enqueue and records a graph_skipped frame when graph is not enabled', async () => {
    const job = {
      id: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      status: IngestionJobStatus.Uploaded,
      currentStage: 'uploaded',
      retryCount: 0,
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn(async (entity) => entity),
    };
    const publisher = {
      publishProgress: jest.fn().mockResolvedValue(undefined),
    };
    const graphTasks = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'doc_1',
          ownerId: 'user_1',
          sourceFileName: 'notes.md',
          sourceFileKey: null,
          contentId: 'content_1',
          graphEnabled: false,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
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
          rawText: '# 标题\n正文',
          sections: [],
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
      { indexChunks: jest.fn().mockResolvedValue(undefined) } as never,
      { extract: jest.fn() } as never,
      { indexChunk: jest.fn() } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      graphTasks as never,
      publisher as never,
    );

    await expect(
      worker.process({
        jobId: 'job_1',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        operation: 'index',
      }),
    ).resolves.toMatchObject({ status: IngestionJobStatus.Ready });

    expect(graphTasks.enqueue).not.toHaveBeenCalled();
    expect(publisher.publishProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'graph_skipped' }),
    );
  });

  it('resumes from the chunk checkpoint without re-parsing or re-embedding', async () => {
    const job = {
      id: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      status: IngestionJobStatus.Failed,
      currentStage: 'indexing',
      retryCount: 1,
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn(async (entity) => entity),
    };
    const parser = { parseStructured: jest.fn() };
    const embedding = { embedDocuments: jest.fn() };
    const index = {
      indexChunks: jest.fn().mockResolvedValue(undefined),
      deleteByDocument: jest.fn(),
    };
    const checkpoints = {
      loadComplete: jest.fn().mockResolvedValue([
        {
          chunkId: 'chunk_1',
          parentId: 'section_0001',
          ownerId: 'user_1',
          documentId: 'doc_1',
          documentVersion: 1,
          sectionId: 'section_0001',
          chunkOrder: 0,
          titlePath: [],
          text: '标题正文',
          parentContext: '标题正文',
          locator: {},
          embedding: [0.1, 0.2],
        },
      ]),
      save: jest.fn(),
    };
    const worker = new DocumentIngestionWorker(
      jobs as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'doc_1',
          ownerId: 'user_1',
          contentId: 'content_1',
          graphEnabled: false,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      } as never,
      { findOne: jest.fn() } as never,
      parser as never,
      { downloadBytes: jest.fn() } as never,
      { get: jest.fn().mockReturnValue(false) } as never,
      { chunk: jest.fn() } as never,
      embedding as never,
      index as never,
      { extract: jest.fn() } as never,
      { indexChunk: jest.fn() } as never,
      {
        find: jest.fn().mockResolvedValue([{ datasetId: 'dataset_1' }]),
      } as never,
      undefined,
      undefined,
      checkpoints as never,
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
      sectionCount: 1,
      chunkCount: 1,
    });

    // 三个高成本阶段全部跳过
    expect(parser.parseStructured).not.toHaveBeenCalled();
    expect(embedding.embedDocuments).not.toHaveBeenCalled();
    expect(checkpoints.save).not.toHaveBeenCalled();
    expect(index.indexChunks).toHaveBeenCalledWith([
      expect.objectContaining({
        chunkId: 'chunk_1',
        datasetIds: ['dataset_1'],
      }),
    ]);
  });
});
