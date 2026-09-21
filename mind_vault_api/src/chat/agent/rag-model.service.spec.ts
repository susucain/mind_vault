import { RagModelService } from './rag-model.service';

describe('RagModelService', () => {
  it('reports the configured fast model for a general answer', async () => {
    const getModelName = jest.fn().mockReturnValue('fast-from-env');
    const service = new RagModelService({
      getModelName,
      invokeJson: jest.fn().mockResolvedValue({
        data: {
          answer: '通用回答',
          citedChunkIds: [],
          confidence: 0.8,
        },
      }),
    } as never);

    await expect(
      service.answerGeneral({
        question: '什么是向量检索？',
        history: [],
        memories: [],
      }),
    ).resolves.toMatchObject({
      model: 'fast-from-env',
      thinking: false,
    });

    expect(getModelName).toHaveBeenCalledWith('fast');
  });
});
