import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetrievalHit } from '../retrieval/retrieval-hit';
import { z } from 'zod';

const questionSchema = z.object({ question: z.string().min(1).max(1000) });
const evaluationSchema = z.object({
  accuracy: z.number().min(0).max(100),
  depth: z.number().min(0).max(100),
  structure: z.number().min(0).max(100),
  clarity: z.number().min(0).max(100),
  strengths: z.array(z.string()).max(10),
  gaps: z.array(z.string()).max(10),
  followUp: z.string().min(1).max(1000),
  reviewItems: z.array(z.string()).max(10),
});

export type InterviewEvaluation = z.infer<typeof evaluationSchema>;

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

@Injectable()
export class InterviewModelService {
  constructor(private readonly config: ConfigService) {}

  async generateQuestion(input: { mode: string; hits: RetrievalHit[] }) {
    const content = await this.complete({
      model: this.config.get<string>('FAST_MODEL', 'qwen3.8-flash'),
      thinking: false,
      system:
        '你是面试官。基于提供的个人项目资料生成一道面试题。只输出 JSON：{"question":""}。不能编造资料中没有的项目事实。',
      user: JSON.stringify({
        mode: input.mode,
        evidence: input.hits.map((hit) => ({
          chunkId: hit.chunkId,
          text: hit.text,
        })),
      }),
    });
    return questionSchema.parse(JSON.parse(content));
  }

  async evaluate(input: {
    question: string;
    answer: string;
    hits: RetrievalHit[];
  }) {
    const content = await this.complete({
      model: this.config.get<string>(
        'REASONING_MODEL',
        'deepseek-v4-flash-0731',
      ),
      thinking: true,
      system:
        '你是严格的面试教练。根据问题、用户回答和资料证据进行评价。不得把资料中没有的经历当作事实。只输出 JSON：{"evaluation":{"accuracy":0,"depth":0,"structure":0,"clarity":0,"strengths":[],"gaps":[],"followUp":"","reviewItems":[]},"citations":[]}。citations 只能填写证据中的 chunkId。',
      user: JSON.stringify({
        question: input.question,
        answer: input.answer,
        evidence: input.hits.map((hit) => ({
          chunkId: hit.chunkId,
          documentId: hit.documentId,
          text: hit.text,
          locator: hit.locator,
        })),
      }),
    });
    const parsed = JSON.parse(content) as {
      evaluation: unknown;
      citations?: unknown;
    };
    const evaluation = evaluationSchema.parse(parsed.evaluation);
    const validIds = new Set(input.hits.map((hit) => hit.chunkId));
    const citations = Array.isArray(parsed.citations)
      ? parsed.citations.filter(
          (id): id is string => typeof id === 'string' && validIds.has(id),
        )
      : [];
    return { evaluation, citations };
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
        `面试模型调用失败: ${body.error?.message ?? response.statusText}`,
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
