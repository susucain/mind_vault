import { ModelGatewayService } from './model-gateway.service';
import { HumanMessage } from '@langchain/core/messages';

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

  it('uses the OpenAI key for an explicitly configured OpenAI-compatible endpoint', () => {
    const gateway = new ModelGatewayService({
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({
            OPENAI_BASE_URL: 'https://provider.example/v1',
            OPENAI_API_KEY: 'openai-key',
            DASHSCOPE_API_KEY: 'dashscope-key',
          })[key] ?? fallback,
      ),
    } as never);

    expect(
      (gateway as unknown as { apiKey: () => string }).apiKey(),
    ).toBe('openai-key');
  });

  it('uses MODEL_NAME when FAST_MODEL is not configured', () => {
    const gateway = new ModelGatewayService({
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({ MODEL_NAME: 'qwen-plus' })[key] ?? fallback,
      ),
    } as never);

    expect(gateway.getChatModel('fast', false).model).toBe('qwen-plus');
  });

  it('omits response_format for Codex models that do not support it', () => {
    const gateway = new ModelGatewayService({
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({ FAST_MODEL: 'codex-auto-review' })[key] ?? fallback,
      ),
    } as never);

    expect(gateway.getChatModel('fast', false).modelKwargs).not.toHaveProperty(
      'response_format',
    );
  });

  it('parses JSON returned in structured text content', async () => {
    const gateway = new ModelGatewayService({ get: jest.fn() } as never);
    jest.spyOn(gateway, 'getChatModel').mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"ok":true}' }],
        usage_metadata: {},
      }),
    } as never);

    await expect(
      gateway.invokeJson('fast', [new HumanMessage('test')], false),
    ).resolves.toMatchObject({
      data: { ok: true },
    });
  });
});
