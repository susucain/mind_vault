import { Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { RetrievalService } from '../retrieval/retrieval.service';
import { RetrievalHit } from '../retrieval/retrieval-hit';
import { MemoryService } from '../memory/memory.service';
import { MemoryNote } from '../memory/memory.types';
import {
  InterviewModelService,
  InterviewEvaluation,
} from './interview-model.service';

/** 面试链路的阶段标识：流式接口据此向前端推送进度 */
export type InterviewStage =
  'preparing' | 'retrieving' | 'evaluating' | 'generating';

export type StageReporter = (stage: InterviewStage) => void;

interface InterviewState {
  ownerId: string;
  datasetId: string;
  topic: string;
  question: string;
  answer?: string;
  hits: RetrievalHit[];
  evaluation?: InterviewEvaluation;
  nextQuestion?: string;
  citations: string[];
}

const State = Annotation.Root({
  ownerId: Annotation<string>,
  datasetId: Annotation<string>,
  topic: Annotation<string>,
  question: Annotation<string>,
  answer: Annotation<string | undefined>,
  hits: Annotation<RetrievalHit[]>,
  evaluation: Annotation<InterviewEvaluation | undefined>,
  nextQuestion: Annotation<string | undefined>,
  citations: Annotation<string[]>,
});

@Injectable()
export class InterviewAgentService {
  private readonly logger = new Logger(InterviewAgentService.name);

  private readonly graph: {
    invoke(
      input: InterviewState,
      config?: StageConfig,
    ): Promise<InterviewState>;
  };

  constructor(
    private readonly models: InterviewModelService,
    private readonly retrieval: RetrievalService,
    private readonly memories: MemoryService,
  ) {
    this.graph = new StateGraph(State)
      .addNode('retrieve', async (state, config) => {
        reportStage(config, 'retrieving');
        const result = await this.retrieval.hybrid({
          ownerId: state.ownerId,
          query: state.question,
          datasetIds: [state.datasetId],
        });
        return { hits: result.hits };
      })
      .addNode('evaluate', async (state, config) => {
        reportStage(config, 'evaluating');
        const result = await this.models.evaluate({
          question: state.question,
          answer: state.answer ?? '',
          hits: state.hits,
        });
        return {
          evaluation: result.evaluation,
          nextQuestion: result.evaluation.followUp,
          citations: result.citations,
        };
      })
      .addEdge(START, 'retrieve')
      .addEdge('retrieve', 'evaluate')
      .addEdge('evaluate', END)
      .compile();
  }

  async generateQuestion(input: {
    ownerId?: string;
    datasetId?: string;
    topic: string;
    intensity: string;
    focus?: string | null;
    jobDescription?: string | null;
    askedQuestions?: string[];
    hits: RetrievalHit[];
    onStage?: StageReporter;
  }) {
    const { onStage, ...payload } = input;
    let hits = input.hits;
    if (input.ownerId && input.datasetId) {
      onStage?.('retrieving');
      const result = await this.retrieval.hybrid({
        ownerId: input.ownerId,
        query: questionQuery(input.topic, input.focus),
        datasetIds: [input.datasetId],
        topK: 8,
      });
      hits = result.hits;
    }
    const memories = await this.loadPreferenceMemories(input.ownerId);
    onStage?.('generating');
    return this.models.generateQuestion({ ...payload, hits, memories });
  }

  /**
   * 提问环节只注入偏好与目标：这两类能让题目贴近用户真正关心的方向。
   * 评估环节（evaluate）不注入，评分口径只依据本轮回答与资料证据。
   * 取用失败不影响出题，降级为不带记忆。
   */
  private async loadPreferenceMemories(
    ownerId?: string,
  ): Promise<MemoryNote[]> {
    if (!ownerId) return [];
    try {
      return await this.memories.recallByKinds(ownerId, ['preference', 'goal']);
    } catch (error) {
      this.logger.warn(
        `长期记忆取用失败，跳过注入: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  evaluate(input: {
    ownerId: string;
    datasetId: string;
    question: string;
    answer: string;
    topic: string;
    onStage?: StageReporter;
  }) {
    const { onStage, ...payload } = input;
    return this.graph.invoke(
      {
        ...payload,
        hits: [],
        citations: [],
      },
      { configurable: { onStage } },
    );
  }
}

/**
 * 图只编译一次，节点闭包在所有请求间共享，所以阶段回调不能捕获在闭包里，
 * 只能通过 invoke 的 config.configurable 逐次传入。
 */
interface StageConfig {
  configurable?: { onStage?: StageReporter };
}

function reportStage(config: unknown, stage: InterviewStage) {
  const reporter = (config as StageConfig | undefined)?.configurable?.onStage;
  reporter?.(stage);
}

/** 检索查询优先用用户填写的聚焦方向，否则回退到主题预设关键词 */
function questionQuery(topic: string, focus?: string | null) {
  const trimmed = focus?.trim();
  if (trimmed) return trimmed;
  const presets: Record<string, string> = {
    project_deep_dive: '项目技术架构 核心难点 设计取舍',
    technical_fundamentals: '技术原理 基础知识 常见考点',
    job_fit: '岗位要求 经历匹配度 求职动机 职业规划',
    system_design: '系统架构 高可用 扩展性 技术选型 取舍',
  };
  return presets[topic] ?? presets.project_deep_dive;
}
