import { ModelGatewayService } from './model-gateway.service';

describe('ModelGatewayService', () => {
  it('selects fast and reasoning ChatModels with explicit thinking configuration', () => {
    const gateway = new ModelGatewayService({
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({
            FAST_MODEL: 'qwen3.8-flash',
            REASONING_MODEL: 'deepseek-v4-flash-0731',
            OPENAI_BASE_URL:
              'https://dashscope.aliyuncs.com/compatible-mode/v1',
            OPENAI_API_KEY: 'test-key',
          })[key] ?? fallback,
      ),
    } as never);

    const fast = gateway.getChatModel('fast', false);
    const reasoning = gateway.getChatModel('reasoning', true);

    expect(fast.model).toBe('qwen3.8-flash');
    expect(fast.modelKwargs).toMatchObject({
      response_format: { type: 'json_object' },
    });
    expect(reasoning.model).toBe('deepseek-v4-flash-0731');
    expect(reasoning.modelKwargs).toMatchObject({
      extra_body: { enable_thinking: true },
    });
  });
});
