import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../embedding/embedding.service';
import { KnowledgeGraphService } from '../graph/knowledge-graph.service';
import { ElasticsearchIndexService } from './es/elasticsearch-index.service';
import { RetrievalHit } from './retrieval-hit';

interface RetrievalInput {
  ownerId: string;
  query: string;
  datasetIds?: string[];
  topK?: number;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly es: ElasticsearchIndexService,
    private readonly embedding: EmbeddingService,
    private readonly graphService: KnowledgeGraphService,
    private readonly config: ConfigService,
  ) {}

  keyword(input: RetrievalInput) {
    return this.es.keywordSearch(input);
  }

  async vector(input: RetrievalInput) {
    const vector = await this.embedding.embedQuery(input.query);
    return this.es.vectorSearch({
      ownerId: input.ownerId,
      vector,
      datasetIds: input.datasetIds,
      topK: input.topK,
    });
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
      this.keyword({ ...input, topK: 30 }),
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
