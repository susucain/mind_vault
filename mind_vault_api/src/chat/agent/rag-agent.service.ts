import { Injectable, Logger } from '@nestjs/common';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { RetrievalHit } from '../../retrieval/retrieval-hit';
import { MemoryService } from '../../memory/memory.service';
import { MemoryItem } from '../../memory/memory.types';
import { LangfuseService } from '../../observability/langfuse.service';
import { RagModelService } from './rag-model.service';
import {
  AnswerMode,
  HistoryTurn,
  historyWindow,
  RagRoute,
  RagState,
} from './rag-types';

export type RagStage =
  'rewrite' | 'recall' | 'classify' | 'gate' | 'retrieve' | 'answer';

@Injectable()
export class RagAgentService {
  private readonly logger = new Logger(RagAgentService.name);
  constructor(
    private readonly models: RagModelService,
    private readonly retrieval: RetrievalService,
    private readonly memories: MemoryService,
    private readonly langfuse: LangfuseService,
  ) {}

  /** 编排入口：整条问答链路记作一条 trace，内部每次模型调用是它的子节点 */
  invoke(
    input: {
      ownerId: string;
      question: string;
      datasetIds: string[];
      summary?: string;
      history?: HistoryTurn[];
    },
    options: {
      signal?: AbortSignal;
      emitStage?: (stage: RagStage) => void;
      sessionId?: string;
    } = {},
  ): Promise<RagState> {
    const { sessionId, ...runOptions } = options;
    return this.langfuse.trace(
      {
        name: 'chat.ask',
        userId: input.ownerId,
        sessionId,
        tags: ['chat', 'ask'],
        input: {
          question: input.question,
          datasetIds: input.datasetIds,
          historyTurns: input.history?.length ?? 0,
        },
        output: (state) => ({
          answerMode: state.answerMode,
          confidence: state.confidence,
          citedChunkIds: state.citedChunkIds,
          usedTools: state.usedTools,
        }),
      },
      () => this.run(input, runOptions),
    );
  }

  /** 改写 → 长期记忆召回 → 意图路由 → 门控 →（命中则检索）→ 回答 */
  private async run(
    input: {
      ownerId: string;
      question: string;
      datasetIds: string[];
      summary?: string;
      history?: HistoryTurn[];
    },
    options: {
      signal?: AbortSignal;
      emitStage?: (stage: RagStage) => void;
    },
  ): Promise<RagState> {
    const runStage = async <T>(
      stage: RagStage,
      action: () => Promise<T>,
    ): Promise<T> => {
      throwIfAborted(options.signal);
      options.emitStage?.(stage);
      const result = await action();
      throwIfAborted(options.signal);
      return result;
    };
    const history = this.windowHistory(input.history ?? []);
    let state: RagState = {
      ownerId: input.ownerId,
      question: input.question,
      summary: input.summary,
      history,
      memories: [],
      datasetIds: input.datasetIds,
      hits: [],
      vectorHits: [],
      hasEvidence: false,
      usedTools: [],
      citedChunkIds: [],
      confidence: 0,
      thinking: false,
      answerMode: 'rag',
    };
    if (history.length > 0) {
      state = {
        ...state,
        ...(await runStage('rewrite', () =>
          this.rewrite(state, options.signal),
        )),
      };
    }
    state = {
      ...state,
      ...(await runStage('recall', () => this.recall(state))),
    };
    state = {
      ...state,
      ...(await runStage('classify', async () => ({
        route: options.signal
          ? await this.models.route(state.question, { signal: options.signal })
          : await this.models.route(state.question),
      }))),
    };
    state = {
      ...state,
      ...(await runStage('gate', () => this.gate(state))),
    };
    if (state.hasEvidence) {
      state = {
        ...state,
        ...(await runStage('retrieve', () => this.retrieve(state))),
      };
    }
    state = {
      ...state,
      ...(await runStage('answer', () => this.answer(state, options.signal))),
    };
    // 各节点的 usedTools 是覆盖语义（gate / retrieve 会整体替换），遗漏的记忆标记在这里补上
    return state.memories.length > 0
      ? { ...state, usedTools: [...state.usedTools, 'memory'] }
      : state;
  }

  /**
   * 会话记忆压缩：把滑出窗口的更早轮次合并进摘要。
   * 由 chat.service 决定何时调用（攒够阈值才压缩），这里只负责模型侧。
   */
  summarize(
    input: {
      previousSummary?: string;
      turns: HistoryTurn[];
    },
    options: { signal?: AbortSignal } = {},
  ): Promise<string> {
    return this.langfuse.trace(
      {
        name: 'chat.summarize',
        tags: ['chat', 'summarize'],
        input: {
          previousSummaryChars: input.previousSummary?.length ?? 0,
          turns: input.turns.length,
        },
        output: (summary) => ({ summaryChars: summary.length }),
      },
      () => this.models.summarize(input, options),
    );
  }

  /**
   * 短期记忆裁剪：只保留最近若干条，并按单条与总量字符预算从新到旧截断。
   * 历史只用于理解指代与上下文，不能作为引用依据。
   */
  private windowHistory(history: HistoryTurn[]): HistoryTurn[] {
    const recent = history.slice(-historyWindow.maxMessages);
    const kept: HistoryTurn[] = [];
    let budget = historyWindow.maxChars;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      const turn = recent[index];
      const content = turn.content.slice(0, historyWindow.maxCharsPerMessage);
      if (content.length > budget) break;
      budget -= content.length;
      kept.unshift({ role: turn.role, content });
    }
    return kept;
  }

  /**
   * 检索是独立于对话的一次调用，拿到的是孤立字符串，
   * 所以先用历史把追问改写成自洽查询，否则"那它的缺点呢"会直接把代词送去检索。
   * 改写失败不影响主流程，回退原问题即可。
   */
  private async rewrite(
    state: RagState,
    signal?: AbortSignal,
  ): Promise<Partial<RagState>> {
    if (state.history.length === 0) return {};
    try {
      const input = {
        question: state.question,
        summary: state.summary,
        history: state.history,
      };
      const question = signal
        ? await this.models.rewriteQuery(input, { signal })
        : await this.models.rewriteQuery(input);
      return { question };
    } catch (error) {
      this.logger.warn(
        `查询改写失败，回退原问题: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }

  /**
   * 长期记忆召回：用改写后的查询找出与当前问题相关的用户记忆。
   * 与资料门控完全独立——记忆只影响表述与背景，不参与"资料里是否真有依据"的判定。
   * 召回失败不影响回答，降级为不注入。
   */
  private async recall(state: RagState): Promise<Partial<RagState>> {
    try {
      const memories = await this.memories.recallMemories(
        state.ownerId,
        state.question,
      );
      return { memories };
    } catch (error) {
      this.logger.warn(
        `长期记忆召回失败，跳过注入: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }

  /**
   * 相关性门控：所有意图都先做一次向量相关性判定。
   * 只靠意图分支无法拦住无关问题——"1+1 等于几" 会被路由成 lookup，
   * 而 keyword 检索对任意中文提问几乎总能命中若干无关分块。
   */
  private async gate(state: RagState) {
    const { hits, hasEvidence } = await this.retrieval.assessEvidence({
      ownerId: state.ownerId,
      query: state.question,
      datasetIds: state.datasetIds,
    });
    if (!hasEvidence) {
      this.logger.warn(
        `检索未命中相关资料，转入无证据分支: question=${state.question}, topScore=${hits[0]?.score ?? 'none'}, hits=${hits.length}`,
      );
    }
    return { vectorHits: hits, hasEvidence, usedTools: ['vector'] };
  }

  private async retrieve(state: RagState) {
    const route = state.route;
    if (!route) throw new Error('RAG 路由缺失');
    if (route.intent === 'lookup') {
      const hits = await this.retrieval.keyword({
        ownerId: state.ownerId,
        query: state.question,
        datasetIds: state.datasetIds,
        topK: 8,
      });
      return { hits, usedTools: ['keyword'] };
    }
    if (route.intent === 'semantic') {
      // 复用门控阶段的向量结果，避免重复调用 embedding
      return {
        hits: state.vectorHits.slice(0, 8),
        usedTools: ['vector'],
      };
    }
    const hybrid = await this.retrieval.hybrid({
      ownerId: state.ownerId,
      query: state.question,
      datasetIds: state.datasetIds,
      entityNames: route.entityNames,
      vectorHits: state.vectorHits,
      topK: 8,
    });
    return { hits: hybrid.hits, usedTools: hybrid.usedTools };
  }

  private async answer(state: RagState, signal?: AbortSignal) {
    if (state.hits.length === 0) {
      // 资料无依据：先明确告知，再用模型通用知识补答，省去用户手动切模式
      const input = {
        question: state.question,
        summary: state.summary,
        history: state.history,
        memories: state.memories,
      };
      const fallback = signal
        ? await this.models.answerGeneral(input, { signal })
        : await this.models.answerGeneral(input);
      return {
        answer: `未在资料中找到与问题相关的内容，以下为基于模型通用知识的回答：\n\n${fallback.result.answer}`,
        // 通用知识没有资料依据，不产出任何引用
        citedChunkIds: [],
        confidence: fallback.result.confidence,
        model: fallback.model,
        thinking: fallback.thinking,
        answerMode: 'general' as AnswerMode,
      };
    }
    const useReasoning =
      state.route?.complexity === 'high' ||
      state.route?.intent === 'compare' ||
      state.route?.intent === 'graph';
    const input = {
      question: state.question,
      summary: state.summary,
      history: state.history,
      memories: state.memories,
      hits: state.hits,
      useReasoning,
    };
    let response = signal
      ? await this.models.answer(input, { signal })
      : await this.models.answer(input);
    const hitIds = new Set(state.hits.map((hit) => hit.chunkId));
    let citedChunkIds = response.result.citedChunkIds.filter((id) =>
      hitIds.has(id),
    );
    if (
      !useReasoning &&
      (response.result.confidence < 0.45 || citedChunkIds.length === 0)
    ) {
      const retryInput = {
        question: state.question,
        summary: state.summary,
        history: state.history,
        memories: state.memories,
        hits: state.hits,
        useReasoning: true,
      };
      response = signal
        ? await this.models.answer(retryInput, { signal })
        : await this.models.answer(retryInput);
      citedChunkIds = response.result.citedChunkIds.filter((id) =>
        hitIds.has(id),
      );
    }
    return {
      answer: response.result.answer,
      citedChunkIds,
      confidence: response.result.confidence,
      model: response.model,
      thinking: response.thinking,
      answerMode: 'rag' as AnswerMode,
    };
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('请求已取消');
}
