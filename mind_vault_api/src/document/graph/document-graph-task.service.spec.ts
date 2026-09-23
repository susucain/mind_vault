import { GraphTaskStatus } from './entities/document-graph-task.entity';
import { DocumentGraphTaskService } from './document-graph-task.service';

describe('DocumentGraphTaskService', () => {
  it('persists and publishes one graph task for each indexed chunk', async () => {
    const tasks = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => input),
      update: jest.fn(),
    };
    const publisher = { publishGraph: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentGraphTaskService(
      tasks as never,
      publisher as never,
    );

    await service.enqueue([
      {
        chunkId: 'chunk_1',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 2,
        text: 'first chunk',
        datasetIds: ['dataset_1'],
      },
      {
        chunkId: 'chunk_2',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 2,
        text: 'second chunk',
        datasetIds: ['dataset_1'],
      },
    ] as never);

    expect(tasks.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          chunkId: 'chunk_1',
          status: GraphTaskStatus.Pending,
        }),
        expect.objectContaining({
          chunkId: 'chunk_2',
          status: GraphTaskStatus.Pending,
        }),
      ]),
    );
    expect(publisher.publishGraph).toHaveBeenCalledTimes(2);
    expect(publisher.publishGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 2,
      }),
    );
  });

  it('cancels pending graph tasks before document deletion or reindex', async () => {
    const tasks = {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const service = new DocumentGraphTaskService(
      tasks as never,
      { publishGraph: jest.fn() } as never,
    );

    await service.cancelActiveTasks('user_1', 'doc_1');

    expect(tasks.update).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user_1', documentId: 'doc_1' }),
      { status: GraphTaskStatus.Cancelled },
    );
  });
});
