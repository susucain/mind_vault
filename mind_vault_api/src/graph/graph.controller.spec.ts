jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));
jest.mock('../auth/current-user.decorator', () => ({
  CurrentUser: () => () => undefined,
}));

import { GraphController } from './graph.controller';

describe('GraphController', () => {
  it('injects the signed-in user as the owner of the answer-context query', async () => {
    const graph = {
      answerContext: jest.fn().mockResolvedValue({
        focus: '',
        nodes: [],
        edges: [],
        truncated: false,
      }),
    };
    const controller = new GraphController(graph as never);

    await controller.answerContext({ id: 'user_1' }, { chunkIds: ['chunk_1'] });

    expect(graph.answerContext).toHaveBeenCalledWith({
      ownerId: 'user_1',
      chunkIds: ['chunk_1'],
      limit: undefined,
    });
  });
});