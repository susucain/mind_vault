/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    const graphTasks = { cancelActiveTasks: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentLifecycleService(
      documents as never,
      contents as never,
      jobs as never,
      publisher as never,
      storage as never,
      index as never,
      graphTasks as never,
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
    expect(graphTasks.cancelActiveTasks).toHaveBeenCalledWith(
      'user_1',
      'doc_1',
    );
  });

  it('queues a reindex job on a fresh job record', async () => {
    const documents = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'doc_1', ownerId: 'user_1', deleted: false }),
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job_old',
        documentVersion: 1,
        status: 'READY',
      }),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ ...input, id: 'job_new' })),
    };
    const publisher = { publishIndex: jest.fn().mockResolvedValue(undefined) };
    const graphTasks = { cancelActiveTasks: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentLifecycleService(
      documents as never,
      {} as never,
      jobs as never,
      publisher as never,
      {} as never,
      {} as never,
      graphTasks as never,
    );

    await expect(service.reindex('user_1', 'doc_1')).resolves.toMatchObject({
      documentId: 'doc_1',
      jobId: 'job_new',
      status: 'UPLOADED',
    });
    expect(jobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'reindex',
        documentVersion: 2,
        status: 'UPLOADED',
      }),
    );
    expect(publisher.publishIndex).toHaveBeenCalledWith({
      jobId: 'job_new',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 2,
      operation: 'reindex',
    });
    expect(graphTasks.cancelActiveTasks).toHaveBeenCalledWith(
      'user_1',
      'doc_1',
    );
  });

  it('rejects a reindex while the document is still being processed', async () => {
    const documents = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'doc_1', ownerId: 'user_1', deleted: false }),
    };
    const jobs = {
      findOne: jest.fn().mockResolvedValue({ id: 'job_1', status: 'CHUNKING' }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const publisher = { publishIndex: jest.fn() };
    const service = new DocumentLifecycleService(
      documents as never,
      {} as never,
      jobs as never,
      publisher as never,
      {} as never,
      {} as never,
    );

    await expect(service.reindex('user_1', 'doc_1')).rejects.toThrow(
      BadRequestException,
    );
    expect(publisher.publishIndex).not.toHaveBeenCalled();
  });

  it('rejects a reindex for a missing or already deleted document', async () => {
    const service = new DocumentLifecycleService(
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      { publishIndex: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    await expect(service.reindex('user_1', 'doc_1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
