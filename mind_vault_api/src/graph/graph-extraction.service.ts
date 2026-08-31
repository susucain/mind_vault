import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentChunk } from '../document/chunking/document-chunk';
import { extractionSchema, GraphExtraction } from './graph-types';

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

@Injectable()
export class GraphExtractionService {
  constructor(private readonly config: ConfigService) {}

  async extract(chunk: DocumentChunk): Promise<GraphExtraction> {
    const response = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.get<string>('FAST_MODEL', 'qwen3.8-flash'),
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是知识图谱抽取器。只从提供原文中提取实体和关系。实体类型只能是 PERSON、PROJECT、TECHNOLOGY、CONCEPT、ORGANIZATION、EVENT。关系类型只能是 USES、USED_FOR、DEPENDS_ON、CAUSES、RELATED_TO、PART_OF、CREATED_BY、MENTIONED_WITH。不得编造。输出 JSON：{"entities":[{"name":"","type":""}],"relations":[{"source":"","target":"","type":"","confidence":0.0}]}。',
          },
          {
            role: 'user',
            content: `来源文档片段：\n${chunk.text}`,
          },
        ],
      }),
    });
    const body = (await response.json()) as ChatResponse;
    if (!response.ok) {
      throw new BadGatewayException(
        `图谱抽取模型调用失败: ${body.error?.message ?? response.statusText}`,
      );
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new BadGatewayException('图谱抽取模型未返回内容');
    return extractionSchema.parse(JSON.parse(content));
  }

  private baseUrl(): string {
    return (
      this.config.get<string>('LLM_BASE_URL') ??
      this.config.get<string>('OPENAI_BASE_URL') ??
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    );
  }

  private apiKey(): string {
    return (
      this.config.get<string>('LLM_API_KEY') ??
      this.config.get<string>('DASHSCOPE_API_KEY') ??
      this.config.get<string>('OPENAI_API_KEY') ??
      ''
    );
  }
}
