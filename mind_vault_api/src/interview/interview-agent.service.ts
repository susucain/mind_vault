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
    invoke(input: InterviewState): Promise<InterviewState>;
  };

  constructor(
    private readonly models: InterviewModelService,
    private readonly retrieval: RetrievalService,
    private readonly memories: MemoryService,
  ) {
    this.graph = new StateGraph(State)
      .addNode('retrieve', async (state) => {
        const result = await this.retrieval.hybrid({
          ownerId: state.ownerId,
          query: state.question,
          datasetIds: [state.datasetId],
        });
        return { hits: result.hits };
      })
      .addNode('evaluate', async (state) => {
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
  }) {
    const hits =
      input.ownerId && input.datasetId
        ? (
            await this.retrieval.hybrid({
              ownerId: input.ownerId,
              query: questionQuery(input.topic, input.focus),
              datasetIds: [input.datasetId],
              topK: 8,
            })
          ).hits
        : input.hits;
    const memories = await this.loadPreferenceMemories(input.ownerId);
    return this.models.generateQuestion({ ...input, hits, memories });
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
  }) {
    return this.graph.invoke({
      ...input,
      hits: [],
      citations: [],
    });
  }
}

/** 检索查询优先用用户填写的聚焦方向，否则回退到主题预设关键词 */
function questionQuery(topic: string, focus?: string | null) {
  const trimmed = focus?.trim();
  if (trimmed) return trimmed;
  const presets: Record<string, string> = {
    project_deep_dive: '项目技术架构 核心难点 设计取舍',
    technical_fundamentals: '技术原理 基础知识 常见考点',
    behavioral: '团队协作 冲突处理 项目经历',
  };
  return presets[topic] ?? presets.project_deep_dive;
}
