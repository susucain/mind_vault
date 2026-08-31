/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('batches texts through the Bailian embeddings API and preserves response order', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0.2] },
            { index: 0, embedding: [0.1] },
          ],
          usage: { total_tokens: 12 },
        }),
        { status: 200 },
      ),
    );
    const service = new EmbeddingService({
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({
            EMBEDDING_BASE_URL:
              'https://dashscope.aliyuncs.com/compatible-mode/v1',
            EMBEDDING_API_KEY: 'test-key',
            EMBEDDING_MODEL: 'qwen3.7-text-embedding',
            EMBEDDING_DIMENSIONS: 1024,
            EMBEDDING_BATCH_SIZE: 2,
          })[key] ?? fallback,
      ),
    } as never);

    await expect(service.embedDocuments(['a', 'b'])).resolves.toEqual([
      [0.1],
      [0.2],
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });
});
