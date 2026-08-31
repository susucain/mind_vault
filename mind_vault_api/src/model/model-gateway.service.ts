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
        : this.config.get<string>('FAST_MODEL', 'qwen3.8-flash');
    const modelKwargs: Record<string, unknown> = {
      response_format: { type: 'json_object' },
    };
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
    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
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
    return (
      this.config.get<string>('LLM_API_KEY') ??
      this.config.get<string>('DASHSCOPE_API_KEY') ??
      this.config.get<string>('OPENAI_API_KEY') ??
      ''
    );
  }
}
