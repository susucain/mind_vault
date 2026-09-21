import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RetrievalHit } from '../retrieval/retrieval-hit';
import { z } from 'zod';
import { ModelGatewayService } from '../model/model-gateway.service';
import { MemoryNote } from '../memory/memory.types';

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

@Injectable()
export class InterviewModelService {
  constructor(private readonly gateway: ModelGatewayService) {}

  async generateQuestion(input: {
    mode: string;
    hits: RetrievalHit[];
    memories?: MemoryNote[];
  }) {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          '你是面试官。基于提供的个人项目资料生成一道面试题。只输出 JSON：{"question":""}。不能编造资料中没有的项目事实。memories 是用户的偏好与目标，只用来让题目更贴近他关心的方向，不属于资料，也不能当作项目事实。',
        ),
        new HumanMessage(
          JSON.stringify({
            mode: input.mode,
            memories: memoryPayload(input.memories),
            evidence: input.hits.map((hit) => ({
              chunkId: hit.chunkId,
              text: hit.text,
            })),
          }),
        ),
      ],
      false,
      (raw) => questionSchema.parse(raw),
    );
    return data;
  }

  /**
   * 评估显式不接收 memories：评分口径只能来自本轮回答与资料证据，
   * 用户的偏好或目标不能成为加分项。
   */
  async evaluate(input: {
    question: string;
    answer: string;
    hits: RetrievalHit[];
  }) {
    const { data } = await this.gateway.invokeJson(
      'reasoning',
      [
        new SystemMessage(
          '你是严格的面试教练。根据问题、用户回答和资料证据进行评价。不得把资料中没有的经历当作事实。只输出 JSON：{"evaluation":{"accuracy":0,"depth":0,"structure":0,"clarity":0,"strengths":[],"gaps":[],"followUp":"","reviewItems":[]},"citations":[]}。citations 只能填写证据中的 chunkId。',
        ),
        new HumanMessage(
          JSON.stringify({
            question: input.question,
            answer: input.answer,
            evidence: input.hits.map((hit) => ({
              chunkId: hit.chunkId,
              documentId: hit.documentId,
              text: hit.text,
              locator: hit.locator,
            })),
          }),
        ),
      ],
      true,
      (raw) => {
        const output = raw as { evaluation?: unknown; citations?: unknown };
        const citations = Array.isArray(output.citations)
          ? output.citations.filter(
              (id: unknown): id is string => typeof id === 'string',
            )
          : [];
        return {
          evaluation: evaluationSchema.parse(output.evaluation),
          citations,
        };
      },
    );
    const validIds = new Set(input.hits.map((hit) => hit.chunkId));
    return {
      evaluation: data.evaluation,
      citations: data.citations.filter((id) => validIds.has(id)),
    };
  }
}

/** 只给内容与类型，不暴露记忆 id，模型无从把它当成可引用的证据 */
function memoryPayload(memories: MemoryNote[] = []) {
  return memories.map((memory) => ({
    content: memory.content,
    kind: memory.kind,
  }));
}
