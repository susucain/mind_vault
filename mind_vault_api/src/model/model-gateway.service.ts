import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { LangfuseService } from '../observability/langfuse.service';

@Injectable()
export class ModelGatewayService {
  constructor(
    private readonly config: ConfigService,
    private readonly langfuse: LangfuseService,
  ) {}

  getModelName(kind: 'fast' | 'reasoning'): string {
    return this.config.getOrThrow<string>(`models.${kind}`);
  }

  /**
   * json 默认为 true：绝大多数调用走结构化输出。
   * 流式回答需要模型直接吐 Markdown 正文，此时必须关掉 JSON 模式，
   * 否则流出来的是 JSON 片段，无法当正文渲染。
   */
  getChatModel(
    kind: 'fast' | 'reasoning',
    thinking: boolean,
    json = true,
    maxTokens?: number,
  ) {
    const model = this.getModelName(kind);
    const modelKwargs: Record<string, unknown> = {};
    if (json && !model.startsWith('codex-')) {
      modelKwargs.response_format = { type: 'json_object' };
    }
    if (thinking) {
      modelKwargs.extra_body = { enable_thinking: true };
    }
    if (maxTokens !== undefined) {
      modelKwargs.max_tokens = maxTokens;
    }
    return new ChatOpenAI({
      apiKey: this.apiKey(),
      model,
      temperature: 0,
      configuration: {
        baseURL: this.baseUrl(),
      },
      modelKwargs,
    });
  }

  async invokeJson<S>(
    kind: 'fast' | 'reasoning',
    messages: BaseMessage[],
    thinking: boolean,
    parse: (raw: unknown) => S,
    options: { signal?: AbortSignal; maxTokens?: number } = {},
  ): Promise<{ data: S; usage: Record<string, unknown> }> {
    const model = this.getChatModel(kind, thinking, true, options.maxTokens);
    // 全项目唯一的模型出口：业务层只要开了 trace，这里的调用就会挂到那条 trace 下
    const callbacks = this.langfuse.callbacks();
    const invokeOptions =
      callbacks.length > 0
        ? { signal: options.signal, callbacks }
        : { signal: options.signal };
    let lastError: unknown;
    let conversation = messages;
    // 首次调用 + 一次带错误反馈的重试
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await model.invoke(conversation, invokeOptions);
      const content = textOf(response.content);
      try {
        return {
          data: parse(JSON.parse(content) as unknown),
          usage: response.usage_metadata ?? {},
        };
      } catch (error) {
        lastError = error;
        conversation = [
          ...messages,
          new AIMessage(content),
          new HumanMessage(
            `上一次输出不符合要求：${errorText(error)}。请严格按要求重新只输出 JSON，不要包含其他内容。`,
          ),
        ];
      }
    }
    throw new BadGatewayException(
      `模型输出不符合预期格式: ${errorText(lastError)}`,
    );
  }

  /**
   * 流式出口：模型每吐一段就回调一次，返回值仍是完整正文。
   * 用于问答回答的边生成边下发——调用方既能立刻把增量推给前端，
   * 又能拿到完整文本去做引用提取与落库。
   */
  async streamText(
    kind: 'fast' | 'reasoning',
    messages: BaseMessage[],
    thinking: boolean,
    options: {
      signal?: AbortSignal;
      onToken?: (delta: string) => void;
    } = {},
  ): Promise<{ text: string; usage: Record<string, unknown> }> {
    const model = this.getChatModel(kind, thinking, false);
    // 全项目唯一的模型出口：业务层只要开了 trace，这里的调用就会挂到那条 trace 下
    const callbacks = this.langfuse.callbacks();
    const stream = await model.stream(
      messages,
      callbacks.length > 0
        ? { signal: options.signal, callbacks }
        : { signal: options.signal },
    );
    let text = '';
    let usage: Record<string, unknown> = {};
    for await (const chunk of stream) {
      if (chunk.usage_metadata) usage = chunk.usage_metadata;
      // 推理模型的思考过程走 additional_kwargs.reasoning_content，不在 content 里，
      // 这里只取正文，避免把思考内容混进回答
      const delta = textOf(chunk.content);
      if (!delta) continue;
      text += delta;
      options.onToken?.(delta);
    }
    return { text, usage };
  }

  private baseUrl() {
    return (
      this.config.get<string>('LLM_BASE_URL') ??
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    );
  }

  private apiKey() {
    const explicitKey = this.config.get<string>('LLM_API_KEY');
    if (explicitKey) return explicitKey;
    return this.config.get<string>('DASHSCOPE_API_KEY') ?? '';
  }
}

/** 把模型返回的 content 收敛成纯文本：字符串直接用，分块内容拼接 text，空分块返回空串 */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (
          typeof part === 'object' &&
          part !== null &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }
        return '';
      })
      .join('');
  }
  return JSON.stringify(content);
}

const maxErrorLength = 500;

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > maxErrorLength
    ? `${text.slice(0, maxErrorLength)}…`
    : text;
}
