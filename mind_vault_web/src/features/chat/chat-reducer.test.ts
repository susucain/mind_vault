import { describe, expect, it } from 'vitest';
import { chatReducer, initialChatState, materializeDraft } from './chat-reducer';

describe('chatReducer', () => {
  it('keeps streamed tokens and citations through done', () => {
    const user = { id: 'u1', conversationId: 'c1', role: 'user' as const, content: '问题', citations: [], createdAt: 'now' };
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user });
    state = chatReducer(state, { type: 'event', event: { type: 'token', content: '答案' } });
    state = chatReducer(state, { type: 'event', event: { type: 'citation', citation: { id: 'cite-1', documentId: 'doc-1', documentName: '资料', excerpt: '原文', locator: { page: 4 } } } });
    state = chatReducer(state, { type: 'event', event: { type: 'done', messageId: 'm1' } });
    expect(state.status).toBe('done');
    expect(materializeDraft(state).at(-1)).toMatchObject({ content: '答案', citations: [{ id: 'cite-1' }] });
  });

  it('marks an interrupted stream without discarding the answer', () => {
    let state = chatReducer(initialChatState(), { type: 'event', event: { type: 'token', content: '已生成' } });
    state = chatReducer(state, { type: 'interrupted' });
    expect(state.status).toBe('interrupted');
    expect(state.draft?.content).toBe('已生成');
  });
});
