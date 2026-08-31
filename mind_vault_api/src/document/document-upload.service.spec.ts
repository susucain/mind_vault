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

  it('resets a failed job and republishes the same document version', async () => {
    const job = {
      id: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
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
      {} as never,
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
});
