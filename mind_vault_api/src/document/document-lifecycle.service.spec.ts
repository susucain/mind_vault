/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { DocumentLifecycleService } from './document-lifecycle.service';

describe('DocumentLifecycleService', () => {
  it('soft deletes the document and queues a scoped external-index cleanup job', async () => {
    const document = {
      id: 'doc_1',
      ownerId: 'user_1',
      contentId: 'content_1',
      sourceFileKey: 'users/user_1/documents/doc_1.txt',
      deleted: false,
      status: 0,
    };
    const documents = {
      findOne: jest.fn().mockResolvedValue(document),
      save: jest.fn().mockResolvedValue(document),
    };
    const contents = {
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const jobs = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'job_1', ...input })),
    };
    const publisher = { publishDelete: jest.fn().mockResolvedValue(undefined) };
    const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
    const index = {
      markDocumentDeleted: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentLifecycleService(
      documents as never,
      contents as never,
      jobs as never,
      publisher as never,
      storage as never,
      index as never,
    );

    await expect(service.remove('user_1', 'doc_1')).resolves.toMatchObject({
      documentId: 'doc_1',
      jobId: expect.any(String),
      status: 'DELETING',
    });
    expect(documents.save).toHaveBeenCalledWith(
      expect.objectContaining({ deleted: true }),
    );
    expect(contents.updateOne).toHaveBeenCalledWith(
      { _id: 'content_1' },
      { $set: { deleted: true } },
    );
    expect(publisher.publishDelete).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user_1', documentId: 'doc_1' }),
    );
  });
});
