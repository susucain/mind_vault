import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../embedding/embedding.service';
import { KnowledgeGraphService } from '../graph/knowledge-graph.service';
import { GraphView } from '../graph/graph-types';
import { DocumentLocator } from '../document/parser/parsed-document';
import { DocumentMetaService } from './document-meta.service';
import { ElasticsearchIndexService } from './es/elasticsearch-index.service';
import {
  HighlightSegment,
  RetrievalHit,
  RetrievalSource,
} from './retrieval-hit';
import { RetrievalMode, RetrievalSort } from './dto/search-query.dto';

interface RetrievalInput {
  ownerId: string;
  query: string;
  datasetIds?: string[];
  topK?: number;
  /** 关键字路径透传给 ES：开启后命中片段会切分成 HighlightSegment[] 返回 */
  highlight?: boolean;
}

export type ScoreKind =
  'normalized_bm25' | 'cosine_similarity' | 'graph_degree' | 'rrf_fusion';

export interface SearchResultItem {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  datasetIds: string[];
  datasetNames: string[];
  text: string;
  highlight: HighlightSegment[] | null;
  parentContext: string;
  locator: DocumentLocator;
  titlePath: string[];
  score: number;
  scoreKind: ScoreKind;
  sources: RetrievalSource[];
  updatedAt?: string;
}

export interface SearchResponse {
  mode: RetrievalMode;
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  truncated: boolean;
  tookMs: number;
  stats: { bySource: Record<string, number>; topScore: number };
  usedTools?: RetrievalSource[];
  graph?: GraphView;
}

export interface SearchInput {
  ownerId: string;
  query: string;
  mode: RetrievalMode;
  datasetIds?: string[];
  sort?: RetrievalSort;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  entityNames?: string[];
  maxHops?: number;
}

const GRAPH_VIEW_LIMIT = 60;

@Injectable()
export class RetrievalService {
  constructor(
    private readonly es: ElasticsearchIndexService,
    private readonly embedding: EmbeddingService,
    private readonly graphService: KnowledgeGraphService,
    private readonly documentMeta: DocumentMetaService,
    private readonly config: ConfigService,
  ) {}

  async keyword(input: RetrievalInput): Promise<RetrievalHit[]> {
    const page = await this.es.keywordSearch(input);
    return page.hits;
  }

  async vector(input: RetrievalInput): Promise<RetrievalHit[]> {
    const vector = await this.embedding.embedQuery(input.query);
    const page = await this.es.vectorSearch({
      ownerId: input.ownerId,
      vector,
      datasetIds: input.datasetIds,
      topK: input.topK,
    });
    return page.hits;
  }

  async graph(
    input: RetrievalInput & { entityNames: string[]; maxHops?: number },
  ) {
    const graph = await this.graphService.search({
      ownerId: input.ownerId,
      entityNames: input.entityNames,
      datasetIds: input.datasetIds,
      maxHops: input.maxHops,
    });
    const chunkIds = [
      ...new Set(
        graph.relations
          .map((relation) => relation.sourceChunkId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const hits = await this.es.getByChunkIds({
      ownerId: input.ownerId,
      chunkIds,
      datasetIds: input.datasetIds,
    });
    const graphHits: RetrievalHit[] = hits.map((hit) => ({
      ...hit,
      sources: ['graph'],
    }));
    return graphHits;
  }

  /**
   * 相关性门控：用向量检索的顶部相似度判断资料里到底有没有相关内容。
   * 只在向量路径上设阈值——keyword 的 BM25 分无上界且依赖语料规模，
   * graph 走纯 filter 查询（_score 为常数），两者都无法设可移植的绝对阈值。
   *
   * 返回的 hits 会被上层复用，避免同一次提问重复调用 embedding。
   */
  async assessEvidence(
    input: RetrievalInput,
  ): Promise<{ hits: RetrievalHit[]; hasEvidence: boolean }> {
    const hits = await this.vector({ ...input, topK: 30 });
    const top = hits[0];
    const minScore = this.config.get<number>('retrieval.vectorMinScore', 0.75);
    return { hits, hasEvidence: Boolean(top && top.score >= minScore) };
  }

  async hybrid(
    input: RetrievalInput & {
      entityNames?: string[];
      vectorHits?: RetrievalHit[];
    },
  ) {
    const [keywordHits, vectorHits, graphHits] = await Promise.all([
      // 问答链路复用 hybrid 时也要拿到命中高亮，供引用片段分段渲染
      this.keyword({ ...input, topK: 30, highlight: true }),
      // 门控阶段已经算过向量时直接复用，省掉一次 embedding 调用
      input.vectorHits
        ? Promise.resolve(input.vectorHits)
        : this.vector({ ...input, topK: 30 }),
      input.entityNames?.length
        ? this.graph({ ...input, entityNames: input.entityNames, maxHops: 2 })
        : Promise.resolve([]),
    ]);
    const hits = reciprocalRankFusion([keywordHits, vectorHits, graphHits]);
    return {
      usedTools: ['keyword', 'vector', ...(graphHits.length ? ['graph'] : [])],
      hits: hits.slice(0, input.topK ?? 8),
    };
  }

  /**
   * 统一检索编排：分派三路 → 补全展示字段 → 归一化评分 → 分页。
   * 各 mode 的 score 量纲不同，通过 scoreKind 显式标注（见设计方案 4.7.5）。
   */
  async search(input: SearchInput): Promise<SearchResponse> {
    const started = Date.now();
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 10;
    const sort = input.sort ?? 'relevance';
    const offset = (page - 1) * pageSize;
    const base = {
      ownerId: input.ownerId,
      datasetIds: input.datasetIds,
      sort,
      from: input.from,
      to: input.to,
    };

    let hits: RetrievalHit[] = [];
    let total = 0;
    let truncated = false;
    let scoreKind: ScoreKind;
    let graph: GraphView | undefined;
    let usedTools: RetrievalSource[] | undefined;
    const bySource: Record<string, number> = {};

    if (input.mode === 'keyword') {
      const result = await this.es.keywordSearch({
        ...base,
        query: input.query,
        page,
        pageSize,
        highlight: true,
      });
      hits = result.hits;
      total = result.total;
      truncated = result.truncated;
      scoreKind = 'normalized_bm25';
      normalizeMinMax(hits);
      bySource.keyword = total;
    } else if (input.mode === 'vector') {
      const vector = await this.embedding.embedQuery(input.query);
      const result = await this.es.vectorSearch({
        ...base,
        vector,
        page,
        pageSize,
      });
      hits = result.hits;
      total = result.total;
      truncated = result.truncated;
      scoreKind = 'cosine_similarity';
      bySource.vector = total;
    } else if (input.mode === 'graph') {
      graph = await this.buildGraphView(input, input.maxHops ?? 1);
      const all = await this.chunksOfGraph(
        input.ownerId,
        graph,
        input.datasetIds,
      );
      total = all.length;
      hits = all.slice(offset, offset + pageSize);
      truncated = graph.truncated;
      scoreKind = 'graph_degree';
      applyRelationScore(hits, graph);
      bySource.graph = total;
    } else {
      const names = input.entityNames?.length
        ? input.entityNames
        : [input.query];
      const [keywordPage, vector, graphView] = await Promise.all([
        this.es.keywordSearch({
          ...base,
          query: input.query,
          topK: 30,
          highlight: true,
        }),
        this.embedding.embedQuery(input.query),
        this.graphService.neighborhood({
          ownerId: input.ownerId,
          entities: names,
          maxHops: input.maxHops ?? 2,
          datasetIds: input.datasetIds,
          limit: GRAPH_VIEW_LIMIT,
        }),
      ]);
      const vectorPage = await this.es.vectorSearch({
        ...base,
        vector,
        topK: 30,
      });
      const graphHits = await this.chunksOfGraph(
        input.ownerId,
        graphView,
        input.datasetIds,
      );
      const fused = reciprocalRankFusion([
        keywordPage.hits,
        vectorPage.hits,
        graphHits,
      ]);
      total = fused.length;
      hits = fused.slice(offset, offset + pageSize);
      scoreKind = 'rrf_fusion';
      graph = graphView;
      usedTools = [
        'keyword',
        'vector',
        ...(graphHits.length ? (['graph'] as RetrievalSource[]) : []),
      ];
      bySource.keyword = keywordPage.total;
      bySource.vector = vectorPage.total;
      bySource.graph = graphHits.length;
    }

    const enriched = await this.documentMeta.enrich(input.ownerId, hits);
    const items: SearchResultItem[] = enriched.map((hit) => ({
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      documentTitle: hit.documentTitle,
      datasetIds: hit.datasetIds,
      datasetNames: hit.datasetNames,
      text: hit.text,
      highlight: hit.highlight ?? null,
      parentContext: hit.parentContext,
      locator: hit.locator,
      titlePath: hit.titlePath,
      score: hit.score,
      scoreKind,
      sources: hit.sources,
      updatedAt: hit.updatedAt,
    }));

    return {
      mode: input.mode,
      items,
      total,
      page,
      pageSize,
      hasNext: !truncated && page * pageSize < total,
      truncated,
      tookMs: Date.now() - started,
      stats: {
        bySource,
        topScore: items.reduce((max, item) => Math.max(max, item.score), 0),
      },
      ...(usedTools ? { usedTools } : {}),
      ...(graph ? { graph } : {}),
    };
  }

  private buildGraphView(
    input: SearchInput,
    maxHops: number,
  ): Promise<GraphView> {
    return this.graphService.neighborhood({
      ownerId: input.ownerId,
      entities: input.entityNames?.length ? input.entityNames : [input.query],
      maxHops,
      datasetIds: input.datasetIds,
      limit: GRAPH_VIEW_LIMIT,
    });
  }

  /** 图谱路径没有相关性分数，回捞到的 Chunk 只保留正文与展示字段 */
  private async chunksOfGraph(
    ownerId: string,
    graph: GraphView,
    datasetIds?: string[],
  ): Promise<RetrievalHit[]> {
    const chunkIds = [
      ...new Set(
        graph.edges
          .map((edge) => edge.sourceChunkId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    return this.es.getByChunkIds({ ownerId, chunkIds, datasetIds });
  }
}

/** BM25 无上界，页内 min-max 归一化到 0~1 供相关度条使用 */
function normalizeMinMax(hits: RetrievalHit[]): void {
  if (hits.length === 0) return;
  const scores = hits.map((hit) => hit.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min;
  for (const hit of hits) {
    hit.score = span > 0 ? Number(((hit.score - min) / span).toFixed(4)) : 1;
  }
}

/** 图谱模式用「命中关系数」代替评分，UI 显示为「关联 N 条」 */
function applyRelationScore(hits: RetrievalHit[], graph: GraphView): void {
  const counts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (!edge.sourceChunkId) continue;
    counts.set(edge.sourceChunkId, (counts.get(edge.sourceChunkId) ?? 0) + 1);
  }
  for (const hit of hits) {
    hit.score = counts.get(hit.chunkId) ?? 0;
  }
}

export function reciprocalRankFusion(
  resultSets: RetrievalHit[][],
  constant = 60,
): RetrievalHit[] {
  const merged = new Map<string, RetrievalHit>();
  resultSets.forEach((hits) => {
    hits.forEach((hit, index) => {
      const previous = merged.get(hit.chunkId);
      const score = 1 / (constant + index + 1);
      if (previous) {
        previous.score += score;
        previous.sources = [...new Set([...previous.sources, ...hit.sources])];
      } else {
        merged.set(hit.chunkId, {
          ...hit,
          score,
          sources: [...hit.sources],
        });
      }
    });
  });
  return [...merged.values()].sort((a, b) => b.score - a.score);
}
