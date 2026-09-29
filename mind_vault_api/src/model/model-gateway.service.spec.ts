import { BadGatewayException } from '@nestjs/common';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { ModelGatewayService } from './model-gateway.service';

/** Langfuse 未启用时的形态：模型出口不下发任何回调 */
const tracingOff = { callbacks: () => [] } as never;

function buildGateway(config: unknown, tracing: unknown = tracingOff) {
  return new ModelGatewayService(config as never, tracing as never);
}

describe('ModelGatewayService', () => {
  it('selects fast and reasoning ChatModels with explicit thinking configuration', () => {
    const gateway = buildGateway({
      getOrThrow: jest.fn(
        (key: string) =>
          ({
            'models.fast': 'qwen3.8-flash',
            'models.reasoning': 'deepseek-v4-flash-0731',
          })[key],
      ),
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({
            OPENAI_BASE_URL:
              'https://dashscope.aliyuncs.com/compatible-mode/v1',
            OPENAI_API_KEY: 'test-key',
          })[key] ?? fallback,
      ),
    });

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

  it('只从 LLM_* 取端点与密钥，不受 OPENAI_* 变量影响', () => {
    const gateway = buildGateway({
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({
            LLM_BASE_URL: 'https://llm.example/v1',
            LLM_API_KEY: 'llm-key',
            OPENAI_BASE_URL: 'https://hijack.example/v1',
            OPENAI_API_KEY: 'openai-key',
            DASHSCOPE_API_KEY: 'dashscope-key',
          })[key] ?? fallback,
      ),
    });

    const internals = gateway as unknown as {
      apiKey: () => string;
      baseUrl: () => string;
    };
    expect(internals.baseUrl()).toBe('https://llm.example/v1');
    expect(internals.apiKey()).toBe('llm-key');
  });

  it('未配置 LLM_API_KEY 时回退到 DASHSCOPE_API_KEY', () => {
    const gateway = buildGateway({
      get: jest.fn(
        (key: string, fallback: unknown) =>
          ({
            DASHSCOPE_API_KEY: 'dashscope-key',
            OPENAI_API_KEY: 'openai-key',
          })[key] ?? fallback,
      ),
    });

    expect((gateway as unknown as { apiKey: () => string }).apiKey()).toBe(
      'dashscope-key',
    );
  });

  it('requires a configured model name', () => {
    const gateway = buildGateway({
      getOrThrow: jest.fn(() => {
        throw new Error('Configuration key "models.fast" does not exist');
      }),
    });

    expect(() => gateway.getChatModel('fast', false)).toThrow(
      'Configuration key "models.fast" does not exist',
    );
  });

  it('omits response_format for Codex models that do not support it', () => {
    const gateway = buildGateway({
      getOrThrow: jest.fn((key: string) =>
        key === 'models.fast' ? 'codex-auto-review' : undefined,
      ),
      get: jest.fn(
        (key: string, fallback: unknown) =>
          (({}) as Record<string, unknown>)[key] ?? fallback,
      ),
    });

    expect(gateway.getChatModel('fast', false).modelKwargs).not.toHaveProperty(
      'response_format',
    );
  });

  it('parses JSON returned in structured text content', async () => {
    const gateway = buildGateway({ get: jest.fn() });
    jest.spyOn(gateway, 'getChatModel').mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"ok":true}' }],
        usage_metadata: {},
      }),
    } as never);

    await expect(
      gateway.invokeJson(
        'fast',
        [new HumanMessage('test')],
        false,
        (raw) => raw as { ok: boolean },
      ),
    ).resolves.toMatchObject({
      data: { ok: true },
    });
  });

  it('passes an AbortSignal to the model invocation', async () => {
    const gateway = buildGateway({ get: jest.fn() });
    const invoke = jest.fn().mockResolvedValue({
      content: '{"ok":true}',
      usage_metadata: {},
    });
    jest.spyOn(gateway, 'getChatModel').mockReturnValue({ invoke } as never);
    const controller = new AbortController();

    await gateway.invokeJson(
      'fast',
      [new HumanMessage('test')],
      false,
      (raw) => raw as { ok: boolean },
      { signal: controller.signal },
    );

    expect(invoke).toHaveBeenCalledWith(expect.any(Array), {
      signal: controller.signal,
    });
  });

  it('开启监控时把 Langfuse 回调交给模型调用', async () => {
    const handler = { name: 'langfuse-handler' } as never;
    const gateway = buildGateway(
      { get: jest.fn() },
      {
        callbacks: () => [handler],
      },
    );
    const invoke = jest.fn().mockResolvedValue({
      content: '{"ok":true}',
      usage_metadata: {},
    });
    jest.spyOn(gateway, 'getChatModel').mockReturnValue({ invoke } as never);

    await gateway.invokeJson(
      'fast',
      [new HumanMessage('test')],
      false,
      (raw) => raw as { ok: boolean },
    );

    expect(invoke).toHaveBeenCalledWith(expect.any(Array), {
      callbacks: [handler],
    });
  });

  it('输出不符合格式时带上错误反馈重试一次', async () => {
    const gateway = buildGateway({ get: jest.fn() });
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({
        content: '{"intent":"lookup"}',
        usage_metadata: {},
      })
      .mockResolvedValueOnce({
        content: '{"intent":"semantic"}',
        usage_metadata: {},
      });
    jest.spyOn(gateway, 'getChatModel').mockReturnValue({ invoke } as never);
    const parse = (raw: unknown) =>
      z.object({ intent: z.enum(['semantic', 'graph']) }).parse(raw);

    await expect(
      gateway.invokeJson('fast', [new HumanMessage('test')], false, parse),
    ).resolves.toMatchObject({ data: { intent: 'semantic' } });

    const calls = invoke.mock.calls as unknown as [BaseMessage[]][];
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toHaveLength(3);
  });

  it('重试后仍不符合格式时抛出 BadGatewayException', async () => {
    const gateway = buildGateway({ get: jest.fn() });
    const invoke = jest.fn().mockResolvedValue({
      content: '不是 JSON',
      usage_metadata: {},
    });
    jest.spyOn(gateway, 'getChatModel').mockReturnValue({ invoke } as never);

    await expect(
      gateway.invokeJson('fast', [new HumanMessage('test')], false, (raw) =>
        z.object({ intent: z.string() }).parse(raw),
      ),
    ).rejects.toThrow(BadGatewayException);

    const calls = invoke.mock.calls as unknown as [BaseMessage[]][];
    expect(calls).toHaveLength(2);
  });
});
