/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { InterviewService } from './interview.service';

describe('InterviewService', () => {
  it('lists only the owner sessions ordered by latest activity', async () => {
    const newer = { id: 'session_2', updatedAt: new Date('2026-09-22') };
    const older = { id: 'session_1', updatedAt: new Date('2026-09-21') };
    const sessions = {
      find: jest.fn().mockResolvedValue([newer, older]),
    };
    const service = new InterviewService(
      sessions as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.listSessions('user_1')).resolves.toEqual({
      items: [newer, older],
    });
    expect(sessions.find).toHaveBeenCalledWith({
      where: { ownerId: 'user_1' },
      order: { updatedAt: 'DESC' },
    });
  });

  it('lists the first pending review item page by default', async () => {
    const items = [{ id: 'review_2' }, { id: 'review_1' }];
    const reviewItems = {
      findAndCount: jest.fn().mockResolvedValue([items, 2]),
    };
    const service = new InterviewService(
      {} as never,
      {} as never,
      reviewItems as never,
      {} as never,
      {} as never,
    );

    await expect(service.listReviewItems('user_1')).resolves.toEqual({
      items,
      total: 2,
      page: 1,
      pageSize: 20,
    });
    expect(reviewItems.findAndCount).toHaveBeenCalledWith({
      where: { ownerId: 'user_1', status: 'PENDING' },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 20,
    });
  });

  it('paginates completed review items by completion time', async () => {
    const items = [{ id: 'review_3' }];
    const reviewItems = {
      findAndCount: jest.fn().mockResolvedValue([items, 5]),
    };
    const service = new InterviewService(
      {} as never,
      {} as never,
      reviewItems as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.listReviewItems('user_1', {
        status: 'COMPLETED',
        page: 2,
        pageSize: 2,
      }),
    ).resolves.toEqual({
      items,
      total: 5,
      page: 2,
      pageSize: 2,
    });
    expect(reviewItems.findAndCount).toHaveBeenCalledWith({
      where: { ownerId: 'user_1', status: 'COMPLETED' },
      order: { completedAt: 'DESC', createdAt: 'DESC' },
      skip: 2,
      take: 2,
    });
  });

  it('scopes paginated review items to the requesting owner', async () => {
    const reviewItems = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const service = new InterviewService(
      {} as never,
      {} as never,
      reviewItems as never,
      {} as never,
      {} as never,
    );

    await service.listReviewItems('user_2', { page: 3, pageSize: 10 });

    expect(reviewItems.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'user_2', status: 'PENDING' },
        skip: 20,
        take: 10,
      }),
    );
  });

  it('creates a session with the requested dataset and first question', async () => {
    const sessions = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'session_1', ...input })),
    };
    const datasets = {
      findOne: jest.fn().mockResolvedValue({ id: 'dataset_1' }),
    };
    const agent = {
      generateQuestion: jest.fn().mockResolvedValue({
        question: '请介绍项目中的缓存设计。',
      }),
    };
    const service = new InterviewService(
      sessions as never,
      {} as never,
      {} as never,
      datasets as never,
      agent as never,
    );

    await expect(
      service.createSession('user_1', {
        datasetId: 'dataset_1',
        mode: 'project_deep_dive',
        totalQuestions: 5,
      }),
    ).resolves.toMatchObject({
      id: expect.any(String),
      datasetId: 'dataset_1',
      status: 'IN_PROGRESS',
      currentQuestion: '请介绍项目中的缓存设计。',
    });
    expect(datasets.findOne).toHaveBeenCalledWith('user_1', 'dataset_1');
  });

  it('evaluates an answer, persists the turn, and creates review items for gaps', async () => {
    const turns = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'turn_1', ...input })),
    };
    const sessions = {
      findOne: jest.fn().mockResolvedValue({
        id: 'session_1',
        ownerId: 'user_1',
        datasetId: 'dataset_1',
        currentIndex: 0,
        totalQuestions: 5,
        status: 'IN_PROGRESS',
        currentQuestion: '如何处理失败消息？',
      }),
      save: jest.fn(async (input) => input),
    };
    const reviewItems = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'review_1', ...input })),
    };
    const agent = {
      evaluate: jest.fn().mockResolvedValue({
        evaluation: {
          accuracy: 80,
          depth: 60,
          structure: 75,
          clarity: 80,
          strengths: ['有项目背景'],
          gaps: ['缺少幂等设计'],
          followUp: '如何保证幂等？',
          reviewItems: ['复习幂等设计'],
        },
        citations: ['chunk_1'],
        nextQuestion: '如何保证幂等？',
      }),
    };
    const service = new InterviewService(
      sessions as never,
      turns as never,
      reviewItems as never,
      {} as never,
      agent as never,
    );

    await expect(
      service.submitAnswer('user_1', 'session_1', {
        question: '如何处理失败消息？',
        answer: '使用重试队列。',
      }),
    ).resolves.toMatchObject({
      turn: { id: expect.any(String) },
      evaluation: { gaps: ['缺少幂等设计'] },
      nextQuestion: '如何保证幂等？',
      reviewItems: [{ id: expect.any(String) }],
    });
    expect(reviewItems.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user_1',
        title: '复习幂等设计',
      }),
    );
  });
});
