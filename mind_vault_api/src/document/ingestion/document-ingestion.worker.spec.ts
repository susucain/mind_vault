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
});
