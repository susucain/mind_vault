import { Injectable } from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { RetrievalHit } from '../../retrieval/retrieval-hit';
import { MemoryItem } from '../../memory/memory.types';
import {
  answerSchema,
  HistoryTurn,
  RagRoute,
  rewriteSchema,
  routeSchema,
  summarySchema,
} from './rag-types';
import { ModelGatewayService } from '../../model/model-gateway.service';

@Injectable()
export class RagModelService {
  constructor(private readonly gateway: ModelGatewayService) {}

  async route(question: string): Promise<RagRoute> {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          '你是 RAG 查询路由器。将问题分类为 lookup、semantic、graph 或 compare；复杂度为 low、medium 或 high；提取不超过十个原文实体名称。仅输出 JSON：{"intent":"","complexity":"","entityNames":[]}',
        ),
        new HumanMessage(question),
      ],
      false,
      (raw) => routeSchema.parse(raw),
    );
    return data;
  }

  /**
   * 结合短期记忆把追问改写成自洽查询，供向量检索与意图路由使用。
   * 无历史时由调用方直接跳过，不走模型。
   */
  async rewriteQuery(input: {
    question: string;
    summary?: string;
    history: HistoryTurn[];
  }): Promise<string> {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          '你是检索查询改写器。结合摘要与历史对话，把当前问题改写成一个不依赖上下文、可独立检索的中文查询：消解代词与省略，补全指代对象。不要回答问题，不要输出解释。仅输出 JSON：{"query":""}',
        ),
        new HumanMessage(
          JSON.stringify({
            summary: input.summary ?? '',
            history: input.history,
            question: input.question,
          }),
        ),
      ],
      false,
      (raw) => rewriteSchema.parse(raw),
    );
    return data.query.trim() || input.question;
  }

  /**
   * 把滑出窗口的更早轮次压缩成摘要，作为后续提问的背景。
   * 传入旧摘要做增量压缩，避免摘要只覆盖最近一段历史。
   */
  async summarize(input: {
    previousSummary?: string;
    turns: HistoryTurn[];
  }): Promise<string> {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          '你是对话记忆压缩器。把历史对话压缩成简洁的中文摘要（300 字以内），保留主题、结论、已确认的偏好与尚未解决的问题；不要编造信息，不要输出解释。仅输出 JSON：{"summary":""}',
        ),
        new HumanMessage(
          JSON.stringify({
            previousSummary: input.previousSummary ?? '',
            turns: input.turns,
          }),
        ),
      ],
      false,
      (raw) => summarySchema.parse(raw),
    );
    return data.summary.trim();
  }

  async answer(input: {
    question: string;
    summary?: string;
    history: HistoryTurn[];
    memories: MemoryItem[];
    hits: RetrievalHit[];
    useReasoning: boolean;
  }) {
    const evidence = input.hits.map((hit) => ({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      text: hit.text,
      locator: hit.locator,
    }));
    const { data } = await this.gateway.invokeJson(
      input.useReasoning ? 'reasoning' : 'fast',
      [
        new SystemMessage(
          '你是个人知识库问答助手。只使用提供的证据回答。证据不足时明确说明。不得编造文件名、页码或引用。摘要、历史对话与长期记忆仅用于理解当前问题的指代、背景与用户偏好，均不得作为引用依据，引用只能来自本轮证据。仅输出 JSON：{"answer":"","citedChunkIds":[],"confidence":0.0}。',
        ),
        new HumanMessage(
          JSON.stringify({
            summary: input.summary ?? '',
            history: input.history,
            memories: memoryPayload(input.memories),
            question: input.question,
            evidence,
          }),
        ),
      ],
      input.useReasoning,
      (raw) => answerSchema.parse(raw),
    );
    return {
      model: this.gateway.getModelName(
        input.useReasoning ? 'reasoning' : 'fast',
      ),
      thinking: input.useReasoning,
      result: data,
    };
  }

  /**
   * 资料无依据时的通用知识补答：不提供任何证据，基于模型自身知识回答。
   * 来源声明由编排层在正文前统一加提示行，这里只产出正文。
   */
  async answerGeneral(input: {
    question: string;
    summary?: string;
    history: HistoryTurn[];
    memories: MemoryItem[];
  }) {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          '你是个人知识库助手。该问题在用户资料中没有找到相关依据，请基于你自己的通用知识回答，不要编造文件名、页码或引用。可参考长期记忆以贴合用户偏好，但不得把它当作资料依据。仅输出 JSON：{"answer":"","citedChunkIds":[],"confidence":0.0}。',
        ),
        new HumanMessage(
          JSON.stringify({
            summary: input.summary ?? '',
            history: input.history,
            memories: memoryPayload(input.memories),
            question: input.question,
          }),
        ),
      ],
      false,
      (raw) => answerSchema.parse(raw),
    );
    return {
      model: this.gateway.getModelName('fast'),
      thinking: false,
      result: data,
    };
  }
}

/**
 * 只把内容与类型交给模型，不暴露记忆 id：
 * 模型拿不到可引用的标识，就不会把长期记忆混进 citedChunkIds。
 */
function memoryPayload(memories: MemoryItem[] = []) {
  return memories.map((memory) => ({
    content: memory.content,
    kind: memory.kind,
  }));
}
