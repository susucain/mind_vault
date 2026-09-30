import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInterviewSessionStream, getReviewItem, listInterviewSessions, submitReviewAnswer } from './interview';

describe('interview API contracts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds the session stream request with a path and JSON body', () => {
    expect(createInterviewSessionStream({
      datasetId: 'dataset-1',
      topic: 'system_design',
      intensity: 'deep',
      totalQuestions: 5,
    })).toEqual({
      path: '/interview/sessions/stream',
      body: {
        datasetId: 'dataset-1',
        topic: 'system_design',
        intensity: 'deep',
        totalQuestions: 5,
      },
    });
  });

  it('unwraps the backend items envelope and normalizes IN_PROGRESS', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: 'session-1',
        datasetId: 'dataset-1',
        topic: 'system_design',
        intensity: 'deep',
        status: 'IN_PROGRESS',
        currentIndex: 2,
        totalQuestions: 5,
        currentQuestion: '如何设计缓存？',
        createdAt: '2026-09-30T08:00:00.000Z',
        updatedAt: '2026-09-30T09:00:00.000Z',
      }],
    }), { headers: { 'Content-Type': 'application/json' } }));

    await expect(listInterviewSessions()).resolves.toEqual([
      expect.objectContaining({
        id: 'session-1',
        status: 'active',
        currentIndex: 2,
        totalQuestions: 5,
      }),
    ]);
  });

  it('keeps the review item detail response envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      item: { id: 'review-1', title: '缓存一致性', status: 'PENDING' },
      sourceTurn: { id: 'turn-1', question: '如何设计缓存？' },
      sourceTopic: 'system_design',
      attempts: [{ id: 'attempt-1', reviewItemId: 'review-1', score: '80.00' }],
    }), { headers: { 'Content-Type': 'application/json' } }));

    await expect(getReviewItem('review-1')).resolves.toEqual({
      item: expect.objectContaining({ id: 'review-1' }),
      sourceTurn: expect.objectContaining({ id: 'turn-1' }),
      sourceTopic: 'system_design',
      attempts: [expect.objectContaining({ id: 'attempt-1' })],
    });
  });

  it('keeps the review answer response envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      attempt: { id: 'attempt-1', reviewItemId: 'review-1', score: '80.00' },
      item: { id: 'review-1', title: '缓存一致性', status: 'COMPLETED' },
      autoCompleted: true,
      score: 80,
    }), { headers: { 'Content-Type': 'application/json' } }));

    await expect(submitReviewAnswer('review-1', '答案')).resolves.toEqual({
      attempt: expect.objectContaining({ id: 'attempt-1' }),
      item: expect.objectContaining({ id: 'review-1' }),
      autoCompleted: true,
      score: 80,
    });
  });
});
