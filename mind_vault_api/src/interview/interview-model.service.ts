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
    topic: string;
    intensity: string;
    focus?: string | null;
    jobDescription?: string | null;
    askedQuestions?: string[];
    hits: RetrievalHit[];
    memories?: MemoryNote[];
  }) {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          `你是面试官。基于提供的个人项目资料生成一道面试题。只输出 JSON：{"question":""}。不能编造资料中没有的项目事实。memories 是用户的偏好与目标，只用来让题目更贴近他关心的方向，不属于资料，也不能当作项目事实。focus 是用户想重点练习的方向，jobDescription 是目标岗位描述，都只在出题时参考，不能当作项目事实。askedQuestions 是已问过的题目，不要重复。${topicGuide(input.topic)}${intensityGuide(input.intensity)}`,
        ),
        new HumanMessage(
          JSON.stringify({
            topic: input.topic,
            intensity: input.intensity,
            focus: input.focus || undefined,
            jobDescription: input.jobDescription || undefined,
            askedQuestions: input.askedQuestions ?? [],
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

function topicGuide(topic: string) {
  const guides: Record<string, string> = {
    project_deep_dive:
      '主题是项目深挖：聚焦项目本身的技术架构、关键难点、设计取舍与可量化结果。',
    technical_fundamentals:
      '主题是技术基础：考察技术原理与基础知识，包括机制、边界、常见坑与取舍。',
    job_fit:
      '主题是岗位匹配：围绕目标岗位的匹配度、求职动机、职业规划与选择理由发问，可结合岗位描述。',
    system_design:
      '主题是系统设计：考察高可用、扩展性、数据模型与技术选型取舍，要求给出可落地的方案。',
  };
  return guides[topic] ? `\n${guides[topic]}` : '';
}

function intensityGuide(intensity: string) {
  return intensity === 'quick'
    ? '\n强度是快速问答：题目独立、聚焦单一考点，可以与已问过的题目换方向。'
    : '\n强度是深度追问：在已有题目基础上继续深挖，逐层逼近实现细节。';
}

/** 只给内容与类型，不暴露记忆 id，模型无从把它当成可引用的证据 */
function memoryPayload(memories: MemoryNote[] = []) {
  return memories.map((memory) => ({
    content: memory.content,
    kind: memory.kind,
  }));
}
