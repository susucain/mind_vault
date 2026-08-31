import { Injectable } from '@nestjs/common';
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

  async hybrid(input: RetrievalInput & { entityNames?: string[] }) {
    const [keywordHits, vectorHits, graphHits] = await Promise.all([
      this.keyword({ ...input, topK: 30 }),
      this.vector({ ...input, topK: 30 }),
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
