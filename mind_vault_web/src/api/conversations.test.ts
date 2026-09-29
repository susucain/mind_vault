import { describe, expect, it } from 'vitest';
import { createMessageStreamRequest } from './conversations';

describe('createMessageStreamRequest', () => {
  it('provides the stream endpoint and the backend message payload', () => {
    expect(createMessageStreamRequest('conversation-1', 'What changed?')).toEqual({
      path: '/conversations/conversation-1/messages/stream',
      init: {
        method: 'POST',
        body: { content: 'What changed?' },
      },
    });
  });
});
