import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage } from '@langchain/core/messages';

@Injectable()
export class ModelGatewayService {
  constructor(private readonly config: ConfigService) {}

  getChatModel(kind: 'fast' | 'reasoning', thinking: boolean) {
    const model =
      kind === 'reasoning'
        ? this.config.get<string>('REASONING_MODEL', 'deepseek-v4-flash-0731')
        : this.config.get<string>('FAST_MODEL') ??
          this.config.get<string>('MODEL_NAME') ??
          'qwen3.8-flash';
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

  async invokeJson<T>(
    kind: 'fast' | 'reasoning',
    messages: BaseMessage[],
    thinking: boolean,
  ): Promise<{ data: T; usage: Record<string, unknown> }> {
    const response = await this.getChatModel(kind, thinking).invoke(messages);
    const content = jsonText(response.content);
    return {
      data: JSON.parse(content) as T,
      usage: response.usage_metadata ?? {},
    };
  }

  private baseUrl() {
    return (
      this.config.get<string>('LLM_BASE_URL') ??
      this.config.get<string>('OPENAI_BASE_URL') ??
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    );
  }

  private apiKey() {
    const explicitKey = this.config.get<string>('LLM_API_KEY');
    if (explicitKey) return explicitKey;
    const explicitEndpoint =
      this.config.get<string>('LLM_BASE_URL') ??
      this.config.get<string>('OPENAI_BASE_URL');
    if (explicitEndpoint) {
      return (
        this.config.get<string>('OPENAI_API_KEY') ??
        this.config.get<string>('DASHSCOPE_API_KEY') ??
        ''
      );
    }
    return (
      this.config.get<string>('DASHSCOPE_API_KEY') ??
      this.config.get<string>('OPENAI_API_KEY') ??
      ''
    );
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
