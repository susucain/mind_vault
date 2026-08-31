import { Injectable } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { RetrievalService } from '../retrieval/retrieval.service';
import { RetrievalHit } from '../retrieval/retrieval-hit';
import {
  InterviewModelService,
  InterviewEvaluation,
} from './interview-model.service';

interface InterviewState {
  ownerId: string;
  datasetId: string;
  mode: string;
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
  mode: Annotation<string>,
  question: Annotation<string>,
  answer: Annotation<string | undefined>,
  hits: Annotation<RetrievalHit[]>,
  evaluation: Annotation<InterviewEvaluation | undefined>,
  nextQuestion: Annotation<string | undefined>,
  citations: Annotation<string[]>,
});

@Injectable()
export class InterviewAgentService {
  private readonly graph: {
    invoke(input: InterviewState): Promise<InterviewState>;
  };

  constructor(
    private readonly models: InterviewModelService,
    private readonly retrieval: RetrievalService,
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
    mode: string;
    hits: RetrievalHit[];
  }) {
    const hits =
      input.ownerId && input.datasetId
        ? (
            await this.retrieval.hybrid({
              ownerId: input.ownerId,
              query: '项目技术架构 核心难点 设计取舍',
              datasetIds: [input.datasetId],
              topK: 8,
            })
          ).hits
        : input.hits;
    return this.models.generateQuestion({ ...input, hits });
  }

  evaluate(input: {
    ownerId: string;
    datasetId: string;
    question: string;
    answer: string;
  }) {
    return this.graph.invoke({
      ...input,
      mode: 'project_deep_dive',
      hits: [],
      citations: [],
    });
  }
}
