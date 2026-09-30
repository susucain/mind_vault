import { afterEach, describe, expect, it, vi } from 'vitest';
import { listInterviewSessions } from './interview';

describe('interview API contracts', () => {
  afterEach(() => vi.restoreAllMocks());

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
});
