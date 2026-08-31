import { Injectable } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { RetrievalHit } from '../../retrieval/retrieval-hit';
import { RagModelService } from './rag-model.service';
import { RagRoute, RagState } from './rag-types';

const RagStateAnnotation = Annotation.Root({
  ownerId: Annotation<string>,
  question: Annotation<string>,
  datasetIds: Annotation<string[]>,
  route: Annotation<RagRoute | undefined>,
  hits: Annotation<RetrievalHit[]>,
  usedTools: Annotation<string[]>,
  answer: Annotation<string | undefined>,
  citedChunkIds: Annotation<string[]>,
  confidence: Annotation<number>,
  model: Annotation<string | undefined>,
  thinking: Annotation<boolean>,
});

@Injectable()
export class RagAgentService {
  private readonly graph: {
    invoke(input: RagState): Promise<RagState>;
  };

  constructor(
    private readonly models: RagModelService,
    private readonly retrieval: RetrievalService,
  ) {
    this.graph = new StateGraph(RagStateAnnotation)
      .addNode('classify', async (state) => ({
        route: await this.models.route(state.question),
      }))
      .addNode('retrieve', async (state) => this.retrieve(state))
      .addNode('generateAnswer', async (state) => this.answer(state))
      .addEdge(START, 'classify')
      .addEdge('classify', 'retrieve')
      .addEdge('retrieve', 'generateAnswer')
      .addEdge('generateAnswer', END)
      .compile();
  }

  invoke(input: {
    ownerId: string;
    question: string;
    datasetIds: string[];
  }): Promise<RagState> {
    return this.graph.invoke({
      ...input,
      hits: [],
      usedTools: [],
      citedChunkIds: [],
      confidence: 0,
      thinking: false,
    });
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
      const hits = await this.retrieval.vector({
        ownerId: state.ownerId,
        query: state.question,
        datasetIds: state.datasetIds,
        topK: 8,
      });
      return { hits, usedTools: ['vector'] };
    }
    const hybrid = await this.retrieval.hybrid({
      ownerId: state.ownerId,
      query: state.question,
      datasetIds: state.datasetIds,
      entityNames: route.entityNames,
      topK: 8,
    });
    return { hits: hybrid.hits, usedTools: hybrid.usedTools };
  }

  private async answer(state: RagState) {
    if (state.hits.length === 0) {
      return {
        answer: '当前资料范围内没有足够证据回答这个问题。',
        citedChunkIds: [],
        confidence: 0,
        model: this.models.constructor.name,
        thinking: false,
      };
    }
    const useReasoning =
      state.route?.complexity === 'high' ||
      state.route?.intent === 'compare' ||
      state.route?.intent === 'graph';
    let response = await this.models.answer({
      question: state.question,
      hits: state.hits,
      useReasoning,
    });
    const hitIds = new Set(state.hits.map((hit) => hit.chunkId));
    let citedChunkIds = response.result.citedChunkIds.filter((id) =>
      hitIds.has(id),
    );
    if (
      !useReasoning &&
      (response.result.confidence < 0.45 || citedChunkIds.length === 0)
    ) {
      response = await this.models.answer({
        question: state.question,
        hits: state.hits,
        useReasoning: true,
      });
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
    };
  }
}
