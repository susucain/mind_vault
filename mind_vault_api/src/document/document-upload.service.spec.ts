/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { DocumentUploadService } from './document-upload.service';

describe('DocumentUploadService', () => {
  it('stores file metadata and queues an indexing job without parsing synchronously', async () => {
    const contentModel = {
      create: jest.fn().mockResolvedValue({ _id: 'mongo_content_1' }),
    };
    const manager = {
      create: jest.fn((_, input) => input),
      save: jest.fn(async (input) => ({ id: 'doc_1', ...input })),
    };
    const jobs = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'job_1', ...input })),
    };
    const storage = {
      isEnabled: jest.fn().mockReturnValue(false),
      uploadBytes: jest
        .fn()
        .mockResolvedValue('users/user_1/documents/doc_1/a.pdf'),
    };
    const publisher = {
      publishIndex: jest.fn().mockResolvedValue(undefined),
    };
    const datasets = {
      findOne: jest.fn().mockResolvedValue({ id: 'dataset_1' }),
    };
    const service = new DocumentUploadService(
      manager as never,
      contentModel as never,
      jobs as never,
      storage as never,
      publisher as never,
      datasets as never,
    );

    await expect(
      service.upload(
        'user_1',
        {
          originalname: 'a.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('pdf'),
        },
        'dataset_1',
      ),
    ).resolves.toMatchObject({
      documentId: expect.any(String),
      jobId: expect.any(String),
      status: 'UPLOADED',
      fileExtension: 'pdf',
    });

    expect(contentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBytes: Buffer.from('pdf') }),
    );
    expect(publisher.publishIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: expect.any(String),
        ownerId: 'user_1',
      }),
    );
  });

  it('uses the client file name instead of the WeChat temporary upload name', async () => {
    const contentModel = {
      create: jest.fn().mockResolvedValue({ _id: 'mongo_content_1' }),
    };
    const manager = {
      create: jest.fn((_, input) => input),
      save: jest.fn(async (input) => ({ id: 'doc_1', ...input })),
    };
    const jobs = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'job_1', ...input })),
    };
    const service = new DocumentUploadService(
      manager as never,
      contentModel as never,
      jobs as never,
      { isEnabled: jest.fn().mockReturnValue(false) } as never,
      { publishIndex: jest.fn().mockResolvedValue(undefined) } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'dataset_1' }) } as never,
    );

    await expect(
      service.upload(
        'user_1',
        {
          originalname: 'nVoiZShG09cGa2be9d37b42111390.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('pdf'),
        },
        'dataset_1',
        { sourceFileName: '中文资料.pdf' },
      ),
    ).resolves.toMatchObject({
      title: '中文资料',
      fileName: '中文资料.pdf',
    });

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: '中文资料',
        sourceFileName: '中文资料.pdf',
      }),
    );
  });

  it('does not mirror a large source file into MongoDB when RustFS is available', async () => {
    const previousMirrorSetting = process.env.STORAGE_MIRROR_SOURCE_BYTES;
    process.env.STORAGE_MIRROR_SOURCE_BYTES = 'true';
    const contentModel = {
      create: jest.fn().mockResolvedValue({ _id: 'mongo_content_1' }),
    };
    const service = new DocumentUploadService(
      {
        create: jest.fn((_, input) => input),
        save: jest.fn(async (input) => ({ id: 'doc_1', ...input })),
      } as never,
      contentModel as never,
      {
        create: jest.fn((input) => input),
        save: jest.fn(async (input) => ({ id: 'job_1', ...input })),
      } as never,
      {
        isEnabled: jest.fn().mockReturnValue(true),
        uploadBytes: jest.fn().mockResolvedValue('users/user_1/documents/a.pdf'),
      } as never,
      { publishIndex: jest.fn().mockResolvedValue(undefined) } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'dataset_1' }) } as never,
    );

    try {
      await service.upload(
        'user_1',
        {
          originalname: 'large.pdf',
          mimetype: 'application/pdf',
          size: 16 * 1024 * 1024,
          buffer: Buffer.alloc(16 * 1024 * 1024),
        },
        'dataset_1',
      );
    } finally {
      process.env.STORAGE_MIRROR_SOURCE_BYTES = previousMirrorSetting;
    }

    expect(contentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBytes: undefined }),
    );
  });

  it('resets a failed job and republishes the same document version', async () => {
    const job = {
      id: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'index',
      status: 'FAILED',
      retryCount: 1,
      errorCode: 'PARSE_FAILED',
      errorMessage: 'bad file',
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn().mockResolvedValue(job),
    };
    const publisher = { publishIndex: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentUploadService(
      { update: jest.fn().mockResolvedValue({ affected: 1 }) } as never,
      {} as never,
      jobs as never,
      {} as never,
      publisher as never,
      {} as never,
    );

    await expect(service.retry('user_1', 'doc_1')).resolves.toMatchObject({
      status: 'UPLOADED',
      retryCount: 1,
    });
    expect(publisher.publishIndex).toHaveBeenCalledWith({
      jobId: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'index',
    });
  });

  it('retries an uploaded job when its initial message was not delivered', async () => {
    const job = {
      id: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'index',
      status: 'UPLOADED',
      retryCount: 0,
      errorCode: null,
      errorMessage: null,
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn().mockResolvedValue(job),
    };
    const publisher = { publishIndex: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentUploadService(
      { update: jest.fn().mockResolvedValue({ affected: 1 }) } as never,
      {} as never,
      jobs as never,
      {} as never,
      publisher as never,
      {} as never,
    );

    await expect(service.retry('user_1', 'doc_1')).resolves.toMatchObject({
      status: 'UPLOADED',
      retryCount: 0,
    });
    expect(publisher.publishIndex).toHaveBeenCalledWith({
      jobId: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'index',
    });
  });

  it('republishes a deletion job as delete when the cleanup failed', async () => {
    const job = {
      id: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'delete',
      status: 'DELETING',
      retryCount: 1,
      errorCode: null,
      errorMessage: null,
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue(job),
      save: jest.fn().mockResolvedValue(job),
    };
    const publisher = { publishIndex: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentUploadService(
      {} as never,
      {} as never,
      jobs as never,
      {} as never,
      publisher as never,
      {} as never,
    );

    await expect(service.retry('user_1', 'doc_1')).resolves.toMatchObject({
      status: 'DELETING',
      retryCount: 1,
    });
    expect(publisher.publishIndex).toHaveBeenCalledWith({
      jobId: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      operation: 'delete',
    });
  });

  it('returns stage progress and graph progress for a document', async () => {
    const jobs = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job_1',
        documentId: 'doc_1',
        status: 'EMBEDDING',
        currentStage: 'embedding',
        retryCount: 0,
        stageCompleted: 4,
        stageTotal: 10,
        stageStartedAt: new Date(Date.now() - 5_000),
        updatedAt: new Date(),
      }),
    };
    const graphTasks = {
      getProgress: jest.fn().mockResolvedValue({
        status: 'PROCESSING',
        completed: 2,
        total: 8,
        failed: 0,
        estimatedRemainingSeconds: 12,
      }),
    };
    const service = new DocumentUploadService(
      {} as never,
      {} as never,
      jobs as never,
      {} as never,
      {} as never,
      {} as never,
      graphTasks as never,
    );

    await expect(service.status('user_1', 'doc_1')).resolves.toMatchObject({
      status: 'EMBEDDING',
      currentStage: 'embedding',
      stageProgress: expect.objectContaining({
        completed: 4,
        total: 10,
        percent: 40,
      }),
      graph: {
        status: 'PROCESSING',
        completed: 2,
        total: 8,
        failed: 0,
        estimatedRemainingSeconds: 12,
      },
    });
    expect(graphTasks.getProgress).toHaveBeenCalledWith(
      'user_1',
      'doc_1',
      undefined,
    );
  });
});
