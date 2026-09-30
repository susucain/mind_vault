import { describe, expect, it } from 'vitest';
import { applyInterviewEvent, createSessionState } from './session-state';

describe('interview session state', () => {
  it('keeps the question and draft when the stream is interrupted', () => {
    const state = createSessionState({ question: '如何设计缓存？', totalQuestions: 3 });
    const withDraft = { ...state, draft: '使用分层缓存并设置 TTL' };
    const next = applyInterviewEvent(withDraft, { type: 'error', code: 'NETWORK', message: '断开' });
    expect(next.question).toBe('如何设计缓存？');
    expect(next.draft).toBe('使用分层缓存并设置 TTL');
    expect(next.interrupted).toBe(true);
  });

  it('advances the question only after a result event', () => {
    const state = createSessionState({ question: '第一题', totalQuestions: 3 });
    const next = applyInterviewEvent(state, {
      type: 'result',
      result: { nextQuestion: '第二题', status: 'IN_PROGRESS', turn: { id: 'turn-1' } },
    });
    expect(next.question).toBe('第二题');
    expect(next.answered).toBe(1);
    expect(next.interrupted).toBe(false);
  });
});
