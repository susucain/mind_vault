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

  it('passes the low-confidence switch through to the neighborhood query (G4)', async () => {
    const graph = {
      neighborhood: jest.fn().mockResolvedValue({
        focus: '',
        nodes: [],
        edges: [],
        truncated: false,
      }),
    };
    const controller = new GraphController(graph as never);

    await controller.neighborhood(
      { id: 'user_1' },
      { entity: 'Kafka', includeLowConfidence: true },
    );

    expect(graph.neighborhood).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user_1',
        entities: ['Kafka'],
        includeLowConfidence: true,
      }),
    );
  });
});
