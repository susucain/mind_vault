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

  getChatModel(kind: 'fast' | 'reasoning', thinking: boolean) {
    const model = this.getModelName(kind);
    const modelKwargs: Record<string, unknown> = {};
    if (!model.startsWith('codex-')) {
      modelKwargs.response_format = { type: 'json_object' };
    }
    if (thinking) {
      modelKwargs.extra_body = { enable_thinking: true };
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
    options: { signal?: AbortSignal } = {},
  ): Promise<{ data: S; usage: Record<string, unknown> }> {
    const model = this.getChatModel(kind, thinking);
    // 全项目唯一的模型出口：业务层只要开了 trace，这里的调用就会挂到那条 trace 下
    const callbacks = this.langfuse.callbacks();
    let lastError: unknown;
    let conversation = messages;
    // 首次调用 + 一次带错误反馈的重试
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await model.invoke(
        conversation,
        callbacks.length > 0 ? { ...options, callbacks } : options,
      );
      const content = jsonText(response.content);
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

function jsonText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
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
    if (text) return text;
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
