import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMessageStreamRequest, listConversations } from './conversations';

describe('createMessageStreamRequest', () => {
  afterEach(() => vi.restoreAllMocks());

  it('provides the stream endpoint and the backend message payload', () => {
    expect(createMessageStreamRequest('conversation-1', 'What changed?')).toEqual({
      path: '/conversations/conversation-1/messages/stream',
      init: {
        method: 'POST',
        body: { content: 'What changed?' },
      },
    });
  });

  it('adapts the backend items envelope for overview counts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: 'conversation-1',
        title: '缓存策略',
        datasetIds: ['dataset-1'],
        createdAt: '2026-09-30T08:00:00.000Z',
        updatedAt: '2026-09-30T09:00:00.000Z',
      }],
    }), { headers: { 'Content-Type': 'application/json' } }));

    await expect(listConversations()).resolves.toEqual([
      expect.objectContaining({ id: 'conversation-1', title: '缓存策略' }),
    ]);
  });
});
