/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { NotFoundException } from '@nestjs/common';
import { InterviewEvaluation } from './interview-model.service';
import { InterviewService } from './interview.service';

function buildService(
  input: {
    sessions?: Record<string, unknown>;
    turns?: Record<string, unknown>;
    reviewItems?: Record<string, unknown>;
    reviewAttempts?: Record<string, unknown>;
    datasets?: Record<string, unknown>;
    agent?: Record<string, unknown>;
  } = {},
) {
  return new InterviewService(
    (input.sessions ?? {}) as never,
    (input.turns ?? {}) as never,
    (input.reviewItems ?? {}) as never,
    (input.reviewAttempts ?? {}) as never,
    (input.datasets ?? {}) as never,
    (input.agent ?? {}) as never,
  );
}

const passingEvaluation: InterviewEvaluation = {
  accuracy: 60,
  depth: 60,
  structure: 60,
  clarity: 60,
  strengths: [],
  gaps: [],
  followUp: '继续说明',
  reviewItems: [],
};

function buildReviewService(
  overrides: {
    item?: Record<string, unknown> | null;
    sourceTurn?: Record<string, unknown> | null;
    sourceSession?: Record<string, unknown> | null;
    attempts?: unknown[];
    evaluation?: InterviewEvaluation;
  } = {},
) {
  const item =
    overrides.item === null
      ? null
      : {
          id: 'review_1',
          ownerId: 'user_1',
          sourceTurnId: 'turn_1',
          title: '复习幂等设计',
          reason: '缺少幂等设计',
          status: 'PENDING',
          completedAt: null as Date | null,
          lastReviewedAt: null as Date | null,
          ...(overrides.item ?? {}),
        };
  const reviewItems = {
    findOne: jest.fn().mockResolvedValue(item),
    save: jest.fn(async (input: Record<string, unknown>) => input),
  };
  const turns = {
    findOne: jest.fn().mockResolvedValue(
      overrides.sourceTurn === undefined
        ? {
            id: 'turn_1',
            sessionId: 'session_1',
            ownerId: 'user_1',
            question: '如何处理失败消息？',
            answer: '使用重试队列。',
          }
        : overrides.sourceTurn,
    ),
  };
  const sessions = {
    findOne: jest.fn().mockResolvedValue(
      overrides.sourceSession === undefined
        ? {
            id: 'session_1',
            ownerId: 'user_1',
            datasetId: 'dataset_1',
            topic: 'technical_fundamentals',
            intensity: 'deep',
          }
        : overrides.sourceSession,
    ),
  };
  const attempts = {
    find: jest.fn().mockResolvedValue(overrides.attempts ?? []),
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn(async (input: Record<string, unknown>) => ({
      id: 'attempt_1',
      ...input,
    })),
  };
  const agent = {
    evaluate: jest.fn().mockResolvedValue({
      evaluation: overrides.evaluation ?? passingEvaluation,
      citations: [],
    }),
  };

  return {
    service: buildService({
      sessions,
      turns,
      reviewItems,
      reviewAttempts: attempts,
      agent,
    }),
    item,
    reviewItems,
    turns,
    sessions,
    attempts,
    agent,
  };
}

describe('InterviewService', () => {
  it('lists only the owner sessions ordered by latest activity', async () => {
    const newer = { id: 'session_2', updatedAt: new Date('2026-09-22') };
    const older = { id: 'session_1', updatedAt: new Date('2026-09-21') };
    const sessions = {
      findAndCount: jest.fn().mockResolvedValue([[newer, older], 2]),
    };
    const turns = { find: jest.fn().mockResolvedValue([]) };
    const service = buildService({ sessions, turns });

    await expect(service.listSessions('user_1')).resolves.toEqual({
      items: [
        { ...newer, averageScore: null },
        { ...older, averageScore: null },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    expect(sessions.findAndCount).toHaveBeenCalledWith({
      where: { ownerId: 'user_1' },
      order: { updatedAt: 'DESC' },
      skip: 0,
      take: 20,
    });
  });

  it('pages the session list with the requested page and size', async () => {
    const sessions = {
      findAndCount: jest.fn().mockResolvedValue([[], 43]),
    };
    const turns = { find: jest.fn().mockResolvedValue([]) };
    const service = buildService({ sessions, turns });

    await expect(
      service.listSessions('user_1', { page: 3, pageSize: 10 }),
    ).resolves.toEqual({ items: [], total: 43, page: 3, pageSize: 10 });
    expect(sessions.findAndCount).toHaveBeenCalledWith({
      where: { ownerId: 'user_1' },
      order: { updatedAt: 'DESC' },
      skip: 20,
      take: 10,
    });
  });

  it('aggregates each session average score from its evaluated turns', async () => {
    const sessions = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          { id: 'session_2', updatedAt: new Date('2026-09-22') },
          { id: 'session_1', updatedAt: new Date('2026-09-21') },
        ],
        2,
      ]),
    };
    const turns = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'turn_1',
          sessionId: 'session_2',
          evaluation: { accuracy: 80, depth: 60, structure: 70, clarity: 90 },
        },
        {
          id: 'turn_2',
          sessionId: 'session_2',
          evaluation: {
            accuracy: 100,
            depth: 100,
            structure: 100,
            clarity: 100,
          },
        },
        {
          id: 'turn_3',
          sessionId: 'session_1',
          evaluation: { accuracy: 40, depth: 40, structure: 40, clarity: 40 },
        },
        { id: 'turn_4', sessionId: 'session_1', evaluation: { skipped: true } },
      ]),
    };
    const service = buildService({ sessions, turns });

    const result = await service.listSessions('user_1');

    // session_2: round((75 + 100) / 2) = 88；session_1: 40（跳过题不计入）
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'session_2', averageScore: 88 }),
      expect.objectContaining({ id: 'session_1', averageScore: 40 }),
    ]);
    expect(turns.find).toHaveBeenCalledWith({
      where: { ownerId: 'user_1', sessionId: expect.anything() },
      select: { id: true, sessionId: true, evaluation: true },
    });
  });

  it('returns all review items without a status filter when status is ALL', async () => {
    const items = [{ id: 'review_1' }, { id: 'review_2' }];
    const reviewItems = {
      findAndCount: jest.fn().mockResolvedValue([items, 2]),
    };
    const service = buildService({ reviewItems });

    await expect(
      service.listReviewItems('user_1', {
        status: 'ALL',
        page: 1,
        pageSize: 10,
      }),
    ).resolves.toEqual({ items, total: 2, page: 1, pageSize: 10 });
    expect(reviewItems.findAndCount).toHaveBeenCalledWith({
      where: { ownerId: 'user_1' },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 10,
    });
  });

  it('lists the first pending review item page by default', async () => {
    const items = [{ id: 'review_2' }, { id: 'review_1' }];
    const reviewItems = {
      findAndCount: jest.fn().mockResolvedValue([items, 2]),
    };
    const service = buildService({ reviewItems });

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
    const service = buildService({ reviewItems });

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
    const service = buildService({ reviewItems });

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
    const service = buildService({ sessions, datasets, agent });

    await expect(
      service.createSession('user_1', {
        datasetId: 'dataset_1',
        topic: 'project_deep_dive',
        intensity: 'deep',
        totalQuestions: 5,
      }),
    ).resolves.toMatchObject({
      id: expect.any(String),
      datasetId: 'dataset_1',
      topic: 'project_deep_dive',
      intensity: 'deep',
      status: 'IN_PROGRESS',
      currentQuestion: '请介绍项目中的缓存设计。',
    });
    expect(datasets.findOne).toHaveBeenCalledWith('user_1', 'dataset_1');
    expect(agent.generateQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'project_deep_dive',
        intensity: 'deep',
      }),
    );
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
        topic: 'project_deep_dive',
        intensity: 'deep',
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
    const service = buildService({ sessions, turns, reviewItems, agent });

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
    // 深度强度沿用评估给出的追问，不额外调用出题
    expect(agent.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'project_deep_dive' }),
    );
    expect(sessions.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentQuestion: '如何保证幂等？' }),
    );
  });

  it('generates a fresh next question in quick intensity without repeating asked ones', async () => {
    const turns = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'turn_2', ...input })),
      find: jest
        .fn()
        .mockResolvedValue([{ id: 'turn_1', question: '如何处理失败消息？' }]),
    };
    const sessions = {
      findOne: jest.fn().mockResolvedValue({
        id: 'session_1',
        ownerId: 'user_1',
        datasetId: 'dataset_1',
        topic: 'technical_fundamentals',
        intensity: 'quick',
        focus: null,
        jobDescription: null,
        currentIndex: 0,
        totalQuestions: 3,
        status: 'IN_PROGRESS',
        currentQuestion: '如何处理失败消息？',
      }),
      save: jest.fn(async (input) => input),
    };
    const agent = {
      evaluate: jest.fn().mockResolvedValue({
        evaluation: { ...passingEvaluation, followUp: '被忽略的追问' },
        citations: [],
      }),
      generateQuestion: jest
        .fn()
        .mockResolvedValue({ question: '说说索引失效的常见场景。' }),
    };
    const service = buildService({ sessions, turns, agent });

    await expect(
      service.submitAnswer('user_1', 'session_1', { answer: '使用重试队列。' }),
    ).resolves.toMatchObject({ nextQuestion: '说说索引失效的常见场景。' });
    expect(agent.generateQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'technical_fundamentals',
        intensity: 'quick',
        askedQuestions: ['如何处理失败消息？'],
      }),
    );
    expect(sessions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        currentQuestion: '说说索引失效的常见场景。',
      }),
    );
  });

  it('records a skipped turn without evaluating or creating review items', async () => {
    const turns = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'turn_skip', ...input })),
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'turn_skip', question: '如何处理失败消息？' },
        ]),
    };
    const sessions = {
      findOne: jest.fn().mockResolvedValue({
        id: 'session_1',
        ownerId: 'user_1',
        datasetId: 'dataset_1',
        topic: 'technical_fundamentals',
        intensity: 'quick',
        focus: null,
        jobDescription: null,
        currentIndex: 0,
        totalQuestions: 3,
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
      evaluate: jest.fn(),
      generateQuestion: jest
        .fn()
        .mockResolvedValue({ question: '说说索引失效的常见场景。' }),
    };
    const service = buildService({ sessions, turns, reviewItems, agent });

    await expect(
      service.submitAnswer('user_1', 'session_1', {
        answer: '',
        skipped: true,
      }),
    ).resolves.toMatchObject({
      turn: { id: expect.any(String) },
      evaluation: { skipped: true },
      nextQuestion: '说说索引失效的常见场景。',
      reviewItems: [],
    });
    // 跳过不调用评估、不生成复习项，且不把占位文本当答案
    expect(agent.evaluate).not.toHaveBeenCalled();
    expect(reviewItems.create).not.toHaveBeenCalled();
    expect(turns.create).toHaveBeenCalledWith(
      expect.objectContaining({ answer: '', evaluation: { skipped: true } }),
    );
  });

  it('completes a review item after a score of 60 or more', async () => {
    const { service, reviewItems, attempts, agent } = buildReviewService();

    const result = await service.submitReviewAnswer('user_1', 'review_1', {
      answer: '新的回答',
    });

    expect(result.score).toBe(60);
    expect(result.autoCompleted).toBe(true);
    expect(reviewItems.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        completedAt: expect.any(Date),
        lastReviewedAt: expect.any(Date),
      }),
    );
    expect(attempts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewItemId: 'review_1',
        ownerId: 'user_1',
        answer: '新的回答',
      }),
    );
    expect(agent.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user_1',
        datasetId: 'dataset_1',
        question: '如何处理失败消息？',
        answer: '新的回答',
        topic: 'technical_fundamentals',
      }),
    );
  });

  it('keeps a pending review item and clears completion time below 60', async () => {
    const { service, reviewItems, item, attempts } = buildReviewService({
      evaluation: {
        accuracy: 40,
        depth: 50,
        structure: 60,
        clarity: 50,
        strengths: [],
        gaps: ['仍缺少幂等设计'],
        followUp: '继续说明',
        reviewItems: [],
      },
    });

    const result = await service.submitReviewAnswer('user_1', 'review_1', {
      answer: '不够完整的回答',
    });

    expect(result.score).toBe(50);
    expect(result.autoCompleted).toBe(false);
    expect(item).toMatchObject({ status: 'PENDING', completedAt: null });
    expect(reviewItems.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING', completedAt: null }),
    );
    expect(attempts.save).toHaveBeenCalled();
  });

  it('restores a completed review item to pending after a low score', async () => {
    const { service, item } = buildReviewService({
      item: { status: 'COMPLETED', completedAt: new Date('2026-09-25') },
      evaluation: {
        accuracy: 10,
        depth: 20,
        structure: 30,
        clarity: 20,
        strengths: [],
        gaps: [],
        followUp: '',
        reviewItems: [],
      },
    });

    const result = await service.submitReviewAnswer('user_1', 'review_1', {
      answer: '答得很差',
    });

    expect(result.autoCompleted).toBe(false);
    expect(item).toMatchObject({ status: 'PENDING', completedAt: null });
  });

  it('returns the source turn, topic and attempts in review detail', async () => {
    const attemptList = [
      { id: 'attempt_1', createdAt: new Date('2026-09-26') },
    ];
    const { service, turns, sessions } = buildReviewService({
      attempts: attemptList,
    });

    await expect(service.getReviewItem('user_1', 'review_1')).resolves.toEqual({
      item: expect.objectContaining({ id: 'review_1' }),
      sourceTurn: expect.objectContaining({ question: '如何处理失败消息？' }),
      sourceTopic: 'technical_fundamentals',
      attempts: attemptList,
    });
    expect(turns.findOne).toHaveBeenCalledWith({
      where: { id: 'turn_1', ownerId: 'user_1' },
    });
    expect(sessions.findOne).toHaveBeenCalledWith({
      where: { id: 'session_1', ownerId: 'user_1' },
    });
  });

  it('rejects review items owned by another user', async () => {
    const { service, reviewItems } = buildReviewService({ item: null });

    await expect(
      service.getReviewItem('user_2', 'review_1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reviewItems.findOne).toHaveBeenCalledWith({
      where: { id: 'review_1', ownerId: 'user_2' },
    });
  });

  it('rejects submitting an answer for another user review item', async () => {
    const { service, agent } = buildReviewService({ item: null });

    await expect(
      service.submitReviewAnswer('user_2', 'review_1', { answer: '新的回答' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(agent.evaluate).not.toHaveBeenCalled();
  });

  it('marks a review item completed manually', async () => {
    const { service, reviewItems, item } = buildReviewService();

    await expect(
      service.updateReviewItemStatus('user_1', 'review_1', {
        status: 'COMPLETED',
      }),
    ).resolves.toMatchObject({
      status: 'COMPLETED',
      completedAt: expect.any(Date),
      lastReviewedAt: expect.any(Date),
    });
    expect(reviewItems.save).toHaveBeenCalledWith(item);
  });

  it('restores a completed review item to pending manually', async () => {
    const { service, item } = buildReviewService({
      item: { status: 'COMPLETED', completedAt: new Date('2026-09-25') },
    });

    await service.updateReviewItemStatus('user_1', 'review_1', {
      status: 'PENDING',
    });

    expect(item).toMatchObject({ status: 'PENDING', completedAt: null });
    expect(item?.lastReviewedAt).toBeInstanceOf(Date);
  });
});
