import {
  DocumentGraphTaskEntity,
  GraphTaskStatus,
} from './entities/document-graph-task.entity';
import { DocumentGraphTaskService } from './document-graph-task.service';

describe('DocumentGraphTaskService', () => {
  it('persists and publishes one graph task for each indexed chunk', async () => {
    const tasks = {
      create: jest.fn((input: DocumentGraphTaskEntity) => input),
      save: jest.fn((input: DocumentGraphTaskEntity[]) =>
        Promise.resolve(input),
      ),
      find: jest.fn().mockResolvedValue([]),
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
        text: 'first chunk '.repeat(20),
        datasetIds: ['dataset_1'],
      },
      {
        chunkId: 'chunk_2',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 2,
        text: 'second chunk '.repeat(20),
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

  it('skips low-value and duplicate chunks and keeps done or in-flight chunks out of the queue', async () => {
    const long = '正文段落'.repeat(30);
    const tasks = {
      create: jest.fn((input: DocumentGraphTaskEntity) => input),
      save: jest.fn((input: DocumentGraphTaskEntity[]) =>
        Promise.resolve(input),
      ),
      find: jest.fn().mockResolvedValue([
        {
          id: 'task_done',
          chunkId: 'chunk_done',
          status: GraphTaskStatus.Ready,
        },
        {
          id: 'task_active',
          chunkId: 'chunk_active',
          status: GraphTaskStatus.Processing,
        },
      ]),
      update: jest.fn(),
    };
    const publisher = { publishGraph: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentGraphTaskService(
      tasks as never,
      publisher as never,
    );

    await service.enqueue([
      {
        chunkId: 'chunk_short',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        text: '标题',
        datasetIds: [],
      },
      {
        chunkId: 'chunk_a',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        text: long,
        datasetIds: [],
      },
      {
        chunkId: 'chunk_b',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        text: long,
        datasetIds: [],
      },
      {
        chunkId: 'chunk_done',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        text: `${long}已完成`,
        datasetIds: [],
      },
      {
        chunkId: 'chunk_active',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        text: `${long}在途中`,
        datasetIds: [],
      },
    ] as never);

    // 短块与重复文本被剔除，已完成/在途的块不重复入队，只剩 chunk_a
    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(tasks.save).toHaveBeenCalledWith([
      expect.objectContaining({
        chunkId: 'chunk_a',
        status: GraphTaskStatus.Pending,
      }),
    ]);
    expect(publisher.publishGraph).toHaveBeenCalledTimes(1);
  });

  it('reuses failed rows instead of inserting duplicate tasks', async () => {
    const tasks = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn().mockResolvedValue([
        {
          id: 'task_failed',
          chunkId: 'chunk_failed',
          status: GraphTaskStatus.Failed,
        },
      ]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const publisher = { publishGraph: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentGraphTaskService(
      tasks as never,
      publisher as never,
    );

    await service.enqueue([
      {
        chunkId: 'chunk_failed',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        text: '失败后重投的正文段落'.repeat(20),
        datasetIds: ['dataset_1'],
      },
    ] as never);

    expect(tasks.create).not.toHaveBeenCalled();
    expect(tasks.save).not.toHaveBeenCalled();
    expect(tasks.update).toHaveBeenCalledWith(
      ['task_failed'],
      expect.objectContaining({
        status: GraphTaskStatus.Pending,
        retryCount: 0,
      }),
    );
    expect(publisher.publishGraph).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task_failed', documentId: 'doc_1' }),
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

  it('aggregates per-task quality counts into the document progress (G3)', async () => {
    const tasks = {
      find: jest.fn().mockResolvedValue([
        {
          status: GraphTaskStatus.Ready,
          quality: {
            entities: 3,
            relations: 2,
            dropped: { missingEndpoint: 1, selfLoop: 0, invalidType: 1 },
            truncatedEntities: 2,
            truncatedRelations: 0,
            relationTypes: { USED_FOR: 1, RELATED_TO: 1 },
          },
        },
        {
          status: GraphTaskStatus.Ready,
          quality: {
            entities: 1,
            relations: 0,
            dropped: { missingEndpoint: 0, selfLoop: 1, invalidType: 0 },
            truncatedEntities: 0,
            truncatedRelations: 5,
            relationTypes: { USED_FOR: 2 },
          },
        },
        // 迁移前留下的空 quality 行按 0 计，不能让汇总变成 NaN
        { status: GraphTaskStatus.Pending },
      ]),
    };
    const service = new DocumentGraphTaskService(tasks as never, {} as never);

    const progress = await service.getProgress('user_1', 'doc_1');

    expect(progress.quality).toEqual({
      entities: 4,
      relations: 2,
      droppedMissingEndpoint: 1,
      droppedSelfLoop: 1,
      droppedInvalidType: 1,
      truncatedEntities: 2,
      truncatedRelations: 5,
      // 关系类型分布按文档累加（G5）：typedTotal = 4，兜底类占比 = 1/4
      relationTypes: { USED_FOR: 3, RELATED_TO: 1 },
      relatedToRatio: 0.25,
    });
    expect(progress.status).toBe('PROCESSING');
  });
});
