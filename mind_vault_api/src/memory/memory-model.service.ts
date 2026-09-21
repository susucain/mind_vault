import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ModelGatewayService } from '../model/model-gateway.service';
import { ExtractedMemory, extractSchema, memoryConfig } from './memory.types';

/**
 * 长期记忆的抽取模型。
 * 与 RAG 的提示词分开：这里唯一的目标是"关于用户"的信息，
 * 资料结论与文档内容必须在提示词层面就被排除。
 */
@Injectable()
export class MemoryModelService {
  constructor(private readonly gateway: ModelGatewayService) {}

  async extract(
    turns: { role: string; content: string }[],
  ): Promise<ExtractedMemory[]> {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          [
            '你是长期记忆抽取器。从对话中抽取关于用户的稳定信息，最多 3 条。',
            '只允许三类：preference（稳定偏好）、fact（关于用户的事实）、goal（用户的目标）。',
            '禁止抽取：资料或文档中的内容与技术结论（如"Kafka 用于削峰填谷"）、引用性表述（如"根据资料…"）、助手对问题的解答本身、一次性的临时信息。',
            '每条 content 是一句话，主语是用户，不超过 40 字，不携带出处。',
            '仅输出 JSON：{"memories":[{"content":"","kind":"preference|fact|goal","confidence":0.0}]}',
          ].join('\n'),
        ),
        new HumanMessage(JSON.stringify({ turns })),
      ],
      false,
      (raw) => extractSchema.parse(raw),
    );
    return data.memories
      .map((item) => ({ ...item, content: item.content.trim() }))
      .filter((item) => item.content.length > 0)
      .filter((item) => item.confidence >= memoryConfig.minExtractConfidence)
      .slice(0, memoryConfig.extractTopN);
  }
}
