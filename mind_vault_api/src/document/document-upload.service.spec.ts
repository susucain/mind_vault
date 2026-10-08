/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentUploadService } from './document-upload.service';

/** 上传可用格式清单桩；pdf 魔数匹配由各用例自行构造文件头 */
const parser = {
  availableExtensions: () => [
    'pdf',
    'docx',
    'doc',
    'xlsx',
    'xls',
    'pptx',
    'ppt',
    'txt',
    'md',
    'csv',
    'json',
  ],
  supportedList: () =>
    'pdf, docx, doc, xlsx, xls, pptx, ppt, txt, md, csv, json',
} as never;

const pdfBytes = Buffer.from('%PDF-1.4\nmind vault');

const tempRoot = mkdtempSync(join(tmpdir(), 'upload-spec-'));
let tempCounter = 0;

/** 流式落盘后 upload() 接收的是临时文件路径，这里为每个用例写一份真实文件 */
function tempFile(
  name: string,
  bytes: Buffer,
  mimetype = 'application/pdf',
): {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
} {
  const path = join(tempRoot, `${tempCounter++}-${name}`);
  writeFileSync(path, bytes);
  return { originalname: name, mimetype, size: bytes.length, path };
}

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('DocumentUploadService', () => {
  it('stores file metadata and queues an indexing job without parsing synchronously', async () => {
    const contentModel = {
      create: jest.fn().mockResolvedValue({ _id: 'mongo_content_1' }),
    };
    const manager = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_, input) => input),
      save: jest.fn(async (input) => ({ id: 'doc_1', ...input })),
    };
    const jobs = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'job_1', ...input })),
    };
    const storage = {
      isEnabled: jest.fn().mockReturnValue(false),
      uploadFile: jest
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
      parser,
    );

    await expect(
      service.upload('user_1', tempFile('a.pdf', pdfBytes), 'dataset_1'),
    ).resolves.toMatchObject({
      documentId: expect.any(String),
      jobId: expect.any(String),
      status: 'UPLOADED',
      fileExtension: 'pdf',
    });

    expect(contentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBytes: pdfBytes }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contentHash: expect.any(String) }),
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
      find: jest.fn().mockResolvedValue([]),
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
      parser,
    );

    await expect(
      service.upload(
        'user_1',
        tempFile('nVoiZShG09cGa2be9d37b42111390.pdf', pdfBytes),
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
    const storage = {
      isEnabled: jest.fn().mockReturnValue(true),
      uploadFile: jest.fn().mockResolvedValue('users/user_1/documents/a.pdf'),
    };
    const service = new DocumentUploadService(
      {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((_, input) => input),
        save: jest.fn(async (input) => ({ id: 'doc_1', ...input })),
      } as never,
      contentModel as never,
      {
        create: jest.fn((input) => input),
        save: jest.fn(async (input) => ({ id: 'job_1', ...input })),
      } as never,
      storage as never,
      { publishIndex: jest.fn().mockResolvedValue(undefined) } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'dataset_1' }) } as never,
      parser,
    );

    try {
      await service.upload(
        'user_1',
        tempFile(
          'large.pdf',
          Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(16 * 1024 * 1024)]),
        ),
        'dataset_1',
      );
    } finally {
      process.env.STORAGE_MIRROR_SOURCE_BYTES = previousMirrorSetting;
    }

    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ size: expect.any(Number) }),
    );
    expect(contentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBytes: undefined }),
    );
  });

  it('rejects a file that duplicates an existing document in the same dataset', async () => {
    const contentModel = { create: jest.fn() };
    const manager = {
      find: jest.fn().mockResolvedValue([
        {
          ownerId: 'user_1',
          datasetId: 'dataset_1',
          documentId: 'doc_existing',
        },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'doc_existing',
        title: '资料',
        sourceFileName: '资料.pdf',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = new DocumentUploadService(
      manager as never,
      contentModel as never,
      { create: jest.fn(), save: jest.fn() } as never,
      { isEnabled: () => false } as never,
      { publishIndex: jest.fn() } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'dataset_1' }) } as never,
      parser,
    );

    await expect(
      service.upload('user_1', tempFile('资料.pdf', pdfBytes), 'dataset_1'),
    ).rejects.toMatchObject({
      response: {
        error: 'DUPLICATE_DOCUMENT',
        details: {
          duplicateOf: expect.objectContaining({
            id: 'doc_existing',
            name: '资料.pdf',
          }),
        },
      },
    });
    expect(contentModel.create).not.toHaveBeenCalled();
    expect(manager.create).not.toHaveBeenCalled();
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
      parser,
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
      parser,
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
      parser,
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
      {
        findOne: jest.fn().mockResolvedValue({ graphEnabled: true }),
      } as never,
      {} as never,
      jobs as never,
      {} as never,
      {} as never,
      {} as never,
      parser,
      graphTasks as never,
    );

    await expect(service.status('user_1', 'doc_1')).resolves.toMatchObject({
      status: 'EMBEDDING',
      currentStage: 'embedding',
      graphEnabled: true,
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

  it('reports graph as null when the document has not enabled graph building', async () => {
    const jobs = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job_1',
        documentId: 'doc_1',
        status: 'READY',
        currentStage: 'ready',
        retryCount: 0,
        documentVersion: 1,
      }),
    };
    const graphTasks = {
      getProgress: jest.fn().mockResolvedValue({
        status: 'NOT_STARTED',
        completed: 0,
        total: 0,
        failed: 0,
        estimatedRemainingSeconds: null,
      }),
    };
    const service = new DocumentUploadService(
      {
        findOne: jest.fn().mockResolvedValue({ graphEnabled: false }),
      } as never,
      {} as never,
      jobs as never,
      {} as never,
      {} as never,
      {} as never,
      parser,
      graphTasks as never,
    );

    await expect(service.status('user_1', 'doc_1')).resolves.toMatchObject({
      graphEnabled: false,
      graph: null,
    });
    expect(graphTasks.getProgress).not.toHaveBeenCalled();
  });

  it('returns the existing document when the same idempotency key is uploaded again', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'doc_existing',
        ownerId: 'user_1',
        title: '资料',
        sourceFileName: '资料.pdf',
        sourceFileExtension: 'pdf',
        sourceFileSize: '1024',
        sourceFileKey: null,
        graphEnabled: false,
      }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job_existing',
        status: 'READY',
      }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const contentModel = { create: jest.fn() };
    const publisher = { publishIndex: jest.fn() };
    const service = new DocumentUploadService(
      manager as never,
      contentModel as never,
      jobs as never,
      { isEnabled: () => false } as never,
      publisher as never,
      { findOne: jest.fn() } as never,
      parser,
    );

    await expect(
      service.upload('user_1', tempFile('资料.pdf', pdfBytes), 'dataset_1', {
        idempotencyKey: 'local-1',
      }),
    ).resolves.toMatchObject({
      documentId: 'doc_existing',
      jobId: 'job_existing',
      status: 'READY',
    });

    expect(contentModel.create).not.toHaveBeenCalled();
    expect(manager.create).not.toHaveBeenCalled();
    expect(publisher.publishIndex).not.toHaveBeenCalled();
  });

  it('rejects a file whose magic bytes do not match the extension', async () => {
    const service = new DocumentUploadService(
      { findOne: jest.fn(), create: jest.fn(), save: jest.fn() } as never,
      { create: jest.fn() } as never,
      { create: jest.fn(), save: jest.fn() } as never,
      { isEnabled: () => false } as never,
      { publishIndex: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      parser,
    );

    await expect(
      service.upload(
        'user_1',
        tempFile('fake.pdf', Buffer.from('PK\x03\x04 not a pdf')),
        'dataset_1',
      ),
    ).rejects.toMatchObject({
      response: { error: 'FILE_TYPE_MISMATCH' },
    });
  });
});
