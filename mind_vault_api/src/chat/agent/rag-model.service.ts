import { Injectable } from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { RetrievalHit } from '../../retrieval/retrieval-hit';
import { MemoryItem } from '../../memory/memory.types';
import {
  FollowupInput,
  HistoryTurn,
  RagRoute,
  rewriteSchema,
  routeSchema,
  suggestionsSchema,
  summarySchema,
} from './rag-types';
import { ModelGatewayService } from '../../model/model-gateway.service';

/**
 * 直出 Markdown 的问答 prompt：不再要求 JSON 包装，正文即答案。
 * 引用改用正文内 [n] 序号，对应 evidence 数组下标（从 1 开始），
 * 服务端再把序号还原成 chunkId，因此模型不需要、也拿不到内部 id。
 */
const ANSWER_SYSTEM_PROMPT =
  '你是个人知识库问答助手。只使用提供的证据回答，用 Markdown 组织正文，代码、列表、表格按需使用。引用证据时在对应句子末尾写上证据序号，形如 [1]，多条写 [1][2]；序号必须来自本轮 evidence 的 index，不要编造。摘要、历史对话与长期记忆仅用于理解当前问题的指代、背景与用户偏好，均不得作为引用依据，引用只能来自本轮证据。证据不足时明确说明，不得编造文件名、页码或引用。直接输出回答正文，不要输出 JSON 或任何包裹标记。';

const GENERAL_SYSTEM_PROMPT =
  '你是个人知识库助手。该问题在用户资料中没有找到相关依据，请基于你自己的通用知识回答，用 Markdown 组织正文。不要编造文件名、页码或引用。可参考长期记忆以贴合用户偏好，但不得把它当作资料依据。直接输出回答正文，不要输出 JSON 或任何包裹标记。';

@Injectable()
export class RagModelService {
  constructor(private readonly gateway: ModelGatewayService) {}

  async route(
    question: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<RagRoute> {
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
      options,
    );
    return data;
  }

  /**
   * 结合短期记忆把追问改写成自洽查询，供向量检索与意图路由使用。
   * 无历史时由调用方直接跳过，不走模型。
   */
  async rewriteQuery(
    input: {
      question: string;
      summary?: string;
      history: HistoryTurn[];
    },
    options: { signal?: AbortSignal } = {},
  ): Promise<string> {
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
      options,
    );
    return data.query.trim() || input.question;
  }

  /**
   * 把滑出窗口的更早轮次压缩成摘要，作为后续提问的背景。
   * 传入旧摘要做增量压缩，避免摘要只覆盖最近一段历史。
   */
  async summarize(
    input: {
      previousSummary?: string;
      turns: HistoryTurn[];
    },
    options: { signal?: AbortSignal } = {},
  ): Promise<string> {
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
      options,
    );
    return data.summary.trim();
  }

  /**
   * 回答正文直出：模型输出 Markdown，引用写成正文内的 [n] 序号标记，
   * 边生成边通过 onToken 回调，调用方拿完整 text 再去还原引用来源。
   */
  async answerStream(
    input: {
      question: string;
      summary?: string;
      history: HistoryTurn[];
      memories: MemoryItem[];
      hits: RetrievalHit[];
      useReasoning: boolean;
    },
    options: { signal?: AbortSignal; onToken?: (delta: string) => void } = {},
  ) {
    // 证据只交内容与位置，并带上序号：模型引用时只认序号，服务端再还原成 chunkId，
    // 不暴露内部 id，模型就编不出可用的引用
    const evidence = input.hits.map((hit, index) => ({
      index: index + 1,
      text: hit.text,
      locator: hit.locator,
    }));
    const kind = input.useReasoning ? 'reasoning' : 'fast';
    const { text } = await this.gateway.streamText(
      kind,
      [
        new SystemMessage(ANSWER_SYSTEM_PROMPT),
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
      options,
    );
    return {
      model: this.gateway.getModelName(kind),
      thinking: input.useReasoning,
      text,
    };
  }

  /**
   * 追问推荐：回答完成后追加一次轻量调用。
   * 只给「问题 + 回答正文（截断）+ 命中文档名」，不塞证据全文，
   * 这次追加调用的成本才可控。
   */
  async suggestFollowups(
    input: FollowupInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<string[]> {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          '你是追问推荐器。根据用户的问题、助手回答与涉及的文档，给出 3 条用户最可能继续追问的中文问题：每条不超过 30 字，必须能在现有资料范围内回答，不要与已问过的重复，不要编号、不要引号、不要解释。仅输出 JSON：{"items":["","",""]}',
        ),
        new HumanMessage(
          JSON.stringify({
            question: input.question,
            answer: input.answer.slice(0, 1200),
            documents: input.documentNames,
          }),
        ),
      ],
      false,
      (raw) => suggestionsSchema.parse(raw),
      { ...options, maxTokens: 256 },
    );
    return data.items.map((item) => item.trim()).filter(Boolean);
  }

  /**
   * 资料无依据时的通用知识补答：不提供任何证据，基于模型自身知识回答。
   * 来源声明由编排层在正文前统一加提示行，这里只产出正文。
   */
  async answerGeneralStream(
    input: {
      question: string;
      summary?: string;
      history: HistoryTurn[];
      memories: MemoryItem[];
    },
    options: { signal?: AbortSignal; onToken?: (delta: string) => void } = {},
  ) {
    const { text } = await this.gateway.streamText(
      'fast',
      [
        new SystemMessage(GENERAL_SYSTEM_PROMPT),
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
      options,
    );
    return {
      model: this.gateway.getModelName('fast'),
      thinking: false,
      text,
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
