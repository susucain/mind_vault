import { Injectable } from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { RetrievalHit } from '../../retrieval/retrieval-hit';
import { answerSchema, RagRoute, routeSchema } from './rag-types';
import { ModelGatewayService } from '../../model/model-gateway.service';

@Injectable()
export class RagModelService {
  constructor(private readonly gateway: ModelGatewayService) {}

  async route(question: string): Promise<RagRoute> {
    const { data } = await this.gateway.invokeJson<RagRoute>(
      'fast',
      [
        new SystemMessage(
          '你是 RAG 查询路由器。将问题分类为 lookup、semantic、graph 或 compare；复杂度为 low、medium 或 high；提取不超过十个原文实体名称。仅输出 JSON：{"intent":"","complexity":"","entityNames":[]}',
        ),
        new HumanMessage(question),
      ],
      false,
    );
    return routeSchema.parse(data);
  }

  async answer(input: {
    question: string;
    hits: RetrievalHit[];
    useReasoning: boolean;
  }) {
    const evidence = input.hits.map((hit) => ({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      text: hit.text,
      locator: hit.locator,
    }));
    const { data } = await this.gateway.invokeJson<{
      answer: string;
      citedChunkIds: string[];
      confidence: number;
    }>(
      input.useReasoning ? 'reasoning' : 'fast',
      [
        new SystemMessage(
          '你是个人知识库问答助手。只使用提供的证据回答。证据不足时明确说明。不得编造文件名、页码或引用。仅输出 JSON：{"answer":"","citedChunkIds":[],"confidence":0.0}。',
        ),
        new HumanMessage(
          JSON.stringify({ question: input.question, evidence }),
        ),
      ],
      input.useReasoning,
    );
    return {
      model: input.useReasoning ? 'deepseek-v4-flash-0731' : 'qwen3.8-flash',
      thinking: input.useReasoning,
      result: answerSchema.parse(data),
    };
  }
}
