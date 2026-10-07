import { DocumentGraphWorker } from './document-graph.worker';
import {
  DocumentGraphTaskEntity,
  GraphTaskStatus,
} from './entities/document-graph-task.entity';
import { connect } from 'amqplib';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('DocumentGraphWorker', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('reconnects and resumes graph consumption after its channel closes', async () => {
    jest.useFakeTimers();
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
      close: jest.fn().mockResolvedValue(undefined),
    };
    const firstConnection = {
      createChannel: jest.fn().mockResolvedValue(firstChannel),
      on: jest.fn(),
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
    const worker = new DocumentGraphWorker(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        get: jest.fn((key: string) => {
          if (key === 'graph.workerEnabled') return true;
          if (key === 'graph.workerConcurrency') return 5;
          return 'amqp://guest:guest@localhost:5672';
        }),
      } as never,
    );

    await worker.onModuleInit();
    firstChannelHandlers.get('close')?.();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(secondChannel.prefetch).toHaveBeenCalledWith(5);
    expect(secondChannel.consume).toHaveBeenCalledWith(
      'mind-vault.graph.worker',
      expect.any(Function),
    );
    await worker.onModuleDestroy();
  });

  it('extracts and indexes a pending graph task independently', async () => {
    const task = {
      id: 'task_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 2,
      chunkId: 'chunk_1',
      text: 'Kafka handles asynchronous work.',
      datasetIds: ['dataset_1'],
      status: GraphTaskStatus.Pending,
      retryCount: 0,
    } as DocumentGraphTaskEntity;
    const tasks = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn(async (input) => input),
    };
    const documents = {
      findOne: jest.fn().mockResolvedValue({
        id: 'doc_1',
        ownerId: 'user_1',
        deleted: false,
      }),
    };
    const extraction = {
      extract: jest.fn().mockResolvedValue({
        entities: [{ name: 'Kafka', type: 'TECHNOLOGY' }],
        relations: [],
      }),
    };
    const graph = { indexChunk: jest.fn().mockResolvedValue(undefined) };
    const publisher = {
      publishProgress: jest.fn().mockResolvedValue(undefined),
    };
    const graphTasks = {
      getProgress: jest.fn().mockResolvedValue({
        status: 'READY',
        completed: 1,
        total: 1,
        failed: 0,
        estimatedRemainingSeconds: null,
      }),
    };
    const worker = new DocumentGraphWorker(
      tasks as never,
      documents as never,
      extraction as never,
      graph as never,
      { get: jest.fn().mockReturnValue(false) } as never,
      publisher as never,
      graphTasks as never,
    );

    await worker.process({ taskId: 'task_1' });

    expect(extraction.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkId: 'chunk_1',
        documentVersion: 2,
        text: 'Kafka handles asynchronous work.',
      }),
    );
    expect(graph.indexChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user_1',
        documentId: 'doc_1',
        chunkId: 'chunk_1',
        datasetIds: ['dataset_1'],
      }),
    );
    expect(task.status).toBe(GraphTaskStatus.Ready);
    expect(publisher.publishProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc_1',
        stage: 'graph',
        status: GraphTaskStatus.Ready,
        graph: {
          status: 'READY',
          completed: 1,
          total: 1,
          failed: 0,
          estimatedRemainingSeconds: null,
        },
      }),
    );
  });

  it('cancels a queued task when its document was deleted', async () => {
    const task = {
      id: 'task_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      status: GraphTaskStatus.Pending,
    } as DocumentGraphTaskEntity;
    const tasks = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn(async (input) => input),
    };
    const extraction = { extract: jest.fn() };
    const graph = { indexChunk: jest.fn() };
    const worker = new DocumentGraphWorker(
      tasks as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      extraction as never,
      graph as never,
      { get: jest.fn().mockReturnValue(false) } as never,
    );

    await worker.process({ taskId: 'task_1' });

    expect(task.status).toBe(GraphTaskStatus.Cancelled);
    expect(extraction.extract).not.toHaveBeenCalled();
    expect(graph.indexChunk).not.toHaveBeenCalled();
  });

  it('does not write a task cancelled while extraction was running', async () => {
    const task = {
      id: 'task_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 1,
      chunkId: 'chunk_1',
      text: 'content',
      datasetIds: [],
      status: GraphTaskStatus.Pending,
      retryCount: 0,
    } as DocumentGraphTaskEntity;
    const tasks = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(null),
      save: jest.fn(async (input) => input),
    };
    const graph = { indexChunk: jest.fn() };
    const worker = new DocumentGraphWorker(
      tasks as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'doc_1',
          ownerId: 'user_1',
          deleted: false,
        }),
      } as never,
      {
        extract: jest.fn().mockResolvedValue({ entities: [], relations: [] }),
      } as never,
      graph as never,
      { get: jest.fn().mockReturnValue(false) } as never,
    );

    await worker.process({ taskId: 'task_1' });

    expect(graph.indexChunk).not.toHaveBeenCalled();
  });
});
