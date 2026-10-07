import { describe, expect, it } from 'vitest';
import { chatReducer, draftOf, initialChatState, messagesOf } from './chat-reducer';
import type { ChatMessage } from '../../types/domain';

const user = (conversationId: string, content = '问题', id = 'u1'): ChatMessage => ({
  id,
  conversationId,
  role: 'user',
  content,
  citations: [],
  createdAt: 'now',
});

describe('chatReducer', () => {
  it('keeps at most five cached conversations, evicting the least recently written', () => {
    let state = initialChatState();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      state = chatReducer(state, { type: 'begin', conversationId: id, user: user(id) });
      state = chatReducer(state, { type: 'discard' });
    }

    // 访问过的会话多了以后，只保留最近 5 个，最旧的 c1 被淘汰
    expect(Object.keys(state.byConversation)).toEqual(['c2', 'c3', 'c4', 'c5', 'c6']);
    expect(messagesOf(state, 'c1')).toEqual([]);
    expect(messagesOf(state, 'c6')).toHaveLength(1);
  });

  it('promotes a re-visited conversation so it is not evicted next', () => {
    let state = initialChatState();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      state = chatReducer(state, { type: 'begin', conversationId: id, user: user(id) });
      state = chatReducer(state, { type: 'discard' });
    }
    // 重新写入 c1 后它变成最近使用，再接入 c6 时被淘汰的是 c2
    state = chatReducer(state, { type: 'history', conversationId: 'c1', messages: [user('c1', '旧问题')] });
    state = chatReducer(state, { type: 'begin', conversationId: 'c6', user: user('c6') });

    expect(Object.keys(state.byConversation)).toEqual(['c3', 'c4', 'c5', 'c1', 'c6']);
  });

  it('keeps streamed tokens and citations through settle', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'message_start', messageId: 'm1' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'token', content: '答案' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'citation', citation: { id: 'cite-1', documentId: 'doc-1', documentName: '资料', chunkId: 'chunk-1', excerpt: '原文', locator: { page: 4 } } } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'done', messageId: 'm1' } });
    state = chatReducer(state, { type: 'settle' });

    expect(state.status).toBe('done');
    expect(state.draft).toBeUndefined();
    expect(messagesOf(state, 'c1').at(-1)).toMatchObject({
      id: 'm1',
      content: '答案',
      citations: [{ id: 'cite-1' }],
    });
  });

  it('marks an interrupted stream without discarding the answer', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'token', content: '已生成' } });
    state = chatReducer(state, { type: 'interrupted' });

    expect(state.status).toBe('interrupted');
    expect(draftOf(state, 'c1')?.content).toBe('已生成');
    // 中断的草稿不落定，保留给「继续生成」
    expect(messagesOf(state, 'c1')).toHaveLength(1);
  });

  it('materializes a result-only frame without duplicating streamed text', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'token', content: 'partial' } });
    state = chatReducer(state, {
      type: 'event',
      conversationId: 'c1',
      event: { type: 'result', result: { answer: '最终答案', citations: [{ id: 'c1', documentId: 'd1', documentName: '资料', chunkId: 'chunk-1', excerpt: '片段', locator: { page: 2 } }] } },
    });

    expect(draftOf(state, 'c1')).toMatchObject({ content: '最终答案', tokens: 4, citations: [{ id: 'c1' }] });
  });

  it('caches messages per conversation so switching never empties the list', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'token', content: 'A' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'done', messageId: 'm1' } });
    state = chatReducer(state, { type: 'settle' });
    state = chatReducer(state, { type: 'begin', conversationId: 'c2', user: user('c2', '第二个问题', 'u2') });

    // 切到 c2 后 c1 的缓存仍在
    expect(messagesOf(state, 'c1')).toHaveLength(2);
    expect(messagesOf(state, 'c2').map((message) => message.id)).toEqual(['u2']);
    // 草稿只属于生成中的会话，不会串到别的会话
    expect(draftOf(state, 'c2')).toBeDefined();
    expect(draftOf(state, 'c1')).toBeUndefined();
  });

  it('keeps local ids when server history catches up', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'message_start', messageId: 'm1' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'token', content: '答案' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'done', messageId: 'm1' } });
    state = chatReducer(state, { type: 'settle' });

    state = chatReducer(state, {
      type: 'history',
      conversationId: 'c1',
      messages: [user('c1', '问题', 'server-u1'), { ...user('c1'), id: 'server-m1', role: 'assistant', content: '答案' }],
    });

    // key 不变，整列不会卸载重建
    expect(messagesOf(state, 'c1').map((message) => message.id)).toEqual(['u1', 'm1']);
  });

  it('ignores late history while the conversation is still streaming', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'token', content: '答案' } });

    const next = chatReducer(state, { type: 'history', conversationId: 'c1', messages: [] });

    expect(messagesOf(next, 'c1')).toHaveLength(1);
  });

  it('ignores a shorter history snapshot that was fetched before the answer landed', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'message_start', messageId: 'm1' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'token', content: '答案' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'done', messageId: 'm1' } });
    state = chatReducer(state, { type: 'settle' });

    // 落定前发出的 listMessages 只带回用户那条
    const next = chatReducer(state, { type: 'history', conversationId: 'c1', messages: [user('c1', '问题', 'server-u1')] });

    expect(messagesOf(next, 'c1')).toHaveLength(2);
  });

  it('carries the follow-up suggestions from the stream into the settled message', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'message_start', messageId: 'm1' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'token', content: '答案' } });
    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'suggestions', items: ['那它的缺点呢', '还有别的方案吗', '怎么落地'] } });

    expect(draftOf(state, 'c1')?.suggestions).toEqual(['那它的缺点呢', '还有别的方案吗', '怎么落地']);

    state = chatReducer(state, { type: 'event', conversationId: 'c1', event: { type: 'done', messageId: 'm1' } });
    state = chatReducer(state, { type: 'settle' });

    expect(messagesOf(state, 'c1').at(-1)?.suggestions).toEqual(['那它的缺点呢', '还有别的方案吗', '怎么落地']);
  });

  it('drops the draft when starting a new conversation', () => {
    let state = chatReducer(initialChatState(), { type: 'begin', conversationId: 'c1', user: user('c1') });
    state = chatReducer(state, { type: 'discard' });

    expect(state.draft).toBeUndefined();
    expect(state.status).toBe('idle');
  });
});