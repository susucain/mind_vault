import { OpenAIEmbeddings } from '@langchain/openai';
import { EmbeddingService } from './embedding.service';

jest.mock('@langchain/openai', () => ({ OpenAIEmbeddings: jest.fn() }));

const MockOpenAIEmbeddings = OpenAIEmbeddings as unknown as jest.Mock;

describe('EmbeddingService', () => {
  const embedDocuments = jest.fn();

  const createService = (overrides: Record<string, unknown> = {}) =>
    new EmbeddingService({
      getOrThrow: jest.fn(
        (key: string) =>
          ({
            'models.embedding': 'qwen3.7-text-embedding',
          })[key],
      ),
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({
            EMBEDDING_BASE_URL:
              'https://dashscope.aliyuncs.com/compatible-mode/v1',
            EMBEDDING_API_KEY: 'test-key',
            EMBEDDING_DIMENSIONS: 1024,
            EMBEDDING_BATCH_SIZE: 10,
            ...overrides,
          })[key] ?? fallback,
      ),
    } as never);

  beforeEach(() => {
    embedDocuments.mockReset();
    MockOpenAIEmbeddings.mockReset();
    MockOpenAIEmbeddings.mockImplementation(() => ({ embedDocuments }));
  });

  it('使用百炼兼容接口配置调用 embedding 并透传文本', async () => {
    embedDocuments.mockResolvedValue([[0.1], [0.2]]);
    const service = createService();

    await expect(service.embedDocuments(['a', 'b'])).resolves.toEqual([
      [0.1],
      [0.2],
    ]);
    expect(MockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        model: 'qwen3.7-text-embedding',
        dimensions: 1024,
        batchSize: 10,
        stripNewLines: false,
        configuration: {
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        },
      }),
    );
    expect(embedDocuments).toHaveBeenCalledWith(['a', 'b']);
  });

  it('embedQuery 返回单条向量', async () => {
    embedDocuments.mockResolvedValue([[0.3]]);
    await expect(createService().embedQuery('你好')).resolves.toEqual([0.3]);
  });

  it('空输入不触发外部调用', async () => {
    await expect(createService().embedDocuments([])).resolves.toEqual([]);
    expect(embedDocuments).not.toHaveBeenCalled();
    expect(MockOpenAIEmbeddings).not.toHaveBeenCalled();
  });

  it('waits for the configured interval between embedding batches', async () => {
    embedDocuments
      .mockResolvedValueOnce([[0.1], [0.2]])
      .mockResolvedValueOnce([[0.3]]);
    const timer = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback) => {
        if (typeof callback === 'function') callback();
        return 0 as never;
      });

    await expect(
      createService({
        EMBEDDING_BATCH_SIZE: 2,
        EMBEDDING_REQUEST_INTERVAL_MS: 1_000,
      }).embedDocuments(['a', 'b', 'c']),
    ).resolves.toEqual([[0.1], [0.2], [0.3]]);

    expect(embedDocuments).toHaveBeenNthCalledWith(1, ['a', 'b']);
    expect(embedDocuments).toHaveBeenNthCalledWith(2, ['c']);
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 1_000);
    timer.mockRestore();
  });

  it('上游调用失败时抛出 BadGatewayException', async () => {
    embedDocuments.mockRejectedValue(new Error('boom'));
    await expect(createService().embedDocuments(['a'])).rejects.toThrow(
      'Embedding API 调用失败: boom',
    );
  });

  it('复用同一个 embedding 客户端实例', async () => {
    embedDocuments.mockResolvedValue([[0.1]]);
    const service = createService();
    await service.embedQuery('a');
    await service.embedQuery('b');
    expect(MockOpenAIEmbeddings).toHaveBeenCalledTimes(1);
  });
});
