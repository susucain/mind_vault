import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetrievalHit } from '../../retrieval/retrieval-hit';
import { answerSchema, RagRoute, routeSchema } from './rag-types';

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

@Injectable()
export class RagModelService {
  constructor(private readonly config: ConfigService) {}

  async route(question: string): Promise<RagRoute> {
    const content = await this.complete({
      model: this.config.get<string>('FAST_MODEL', 'qwen3.8-flash'),
      thinking: false,
      system:
        '你是 RAG 查询路由器。将问题分类为 lookup、semantic、graph 或 compare；复杂度为 low、medium 或 high；提取不超过十个原文实体名称。仅输出 JSON：{"intent":"","complexity":"","entityNames":[]}',
      user: question,
    });
    return routeSchema.parse(JSON.parse(content));
  }

  async answer(input: {
    question: string;
    hits: RetrievalHit[];
    useReasoning: boolean;
  }) {
    const model = input.useReasoning
      ? this.config.get<string>('REASONING_MODEL', 'deepseek-v4-flash-0731')
      : this.config.get<string>('FAST_MODEL', 'qwen3.8-flash');
    const evidence = input.hits.map((hit) => ({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      text: hit.text,
      locator: hit.locator,
    }));
    const content = await this.complete({
      model,
      thinking: input.useReasoning,
      system:
        '你是个人知识库问答助手。只使用提供的证据回答。证据不足时明确说明。不得编造文件名、页码或引用。仅输出 JSON：{"answer":"","citedChunkIds":[],"confidence":0.0}。',
      user: JSON.stringify({ question: input.question, evidence }),
    });
    return {
      model,
      thinking: input.useReasoning,
      result: answerSchema.parse(JSON.parse(content)),
    };
  }

  private async complete(input: {
    model: string;
    thinking: boolean;
    system: string;
    user: string;
  }) {
    const response = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        ...(input.thinking ? { extra_body: { enable_thinking: true } } : {}),
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
    });
    const body = (await response.json()) as ChatResponse;
    if (!response.ok || !body.choices?.[0]?.message?.content) {
      throw new BadGatewayException(
        `RAG 模型调用失败: ${body.error?.message ?? response.statusText}`,
      );
    }
    return body.choices[0].message.content;
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
