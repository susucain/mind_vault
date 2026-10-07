import { jsonRequest, request } from './client';
import { appConfig } from '../lib/config';
import type { EntityType, GraphView, RelationType } from '../types/domain';

export interface GraphEntitySuggestion {
  id: string;
  name: string;
  type: EntityType;
  mentionCount: number;
}

export interface EntitySuggestRequest {
  q?: string;
  types?: EntityType[];
  limit?: number;
}

export interface NeighborhoodRequest {
  entity: string;
  maxHops?: number;
  entityTypes?: EntityType[];
  relationTypes?: RelationType[];
  datasetIds?: string[];
  limit?: number;
}

export interface AnswerContextRequest {
  /** 本条回答实际引用的 chunk；图谱只收敛在这批 chunk 上 */
  chunkIds: string[];
  limit?: number;
}

const MOCK_NAMES = ['向量检索', '倒排索引', 'Elasticsearch', 'Kafka', '召回策略', 'RAG 检索增强'];
const MOCK_TYPES: EntityType[] = ['TECHNOLOGY', 'CONCEPT', 'TECHNOLOGY', 'TECHNOLOGY', 'CONCEPT', 'CONCEPT'];

function mockSuggest(q?: string): { items: GraphEntitySuggestion[] } {
  const keyword = (q ?? '').trim().toLocaleLowerCase('zh-CN');
  const items = MOCK_NAMES.filter((name) => !keyword || name.toLocaleLowerCase('zh-CN').includes(keyword)).map(
    (name, index) => ({
      id: name,
      name,
      type: MOCK_TYPES[index % MOCK_TYPES.length],
      mentionCount: 14 - index,
    }),
  );
  return { items };
}

/** 围绕焦点实体生成一张小图；hops > 1 时追加二级邻域，便于验证展开形态。 */
function mockNeighborhood(focus: string, maxHops: number): GraphView {
  const center = focus.trim() || '示例实体';
  const nodes = [
    { id: center, name: center, type: 'TECHNOLOGY' as EntityType, degree: MOCK_NAMES.length, isFocus: true },
    ...MOCK_NAMES.map((name, index) => ({
      id: name,
      name,
      type: MOCK_TYPES[index % MOCK_TYPES.length],
      degree: 1,
    })),
  ];
  const edges = MOCK_NAMES.map((name, index) => ({
    id: `${center}|RELATED_TO|${name}|mock-chunk-${index}`,
    source: center,
    target: name,
    type: 'RELATED_TO' as RelationType,
    confidence: index % 2 ? 0.42 : 0.86,
    sourceChunkId: `mock-chunk-${index + 1}`,
  }));

  if (maxHops > 1) {
    nodes.push({ id: '二级邻域实体', name: '二级邻域实体', type: 'PROJECT', degree: 1 });
    edges.push({
      id: `${MOCK_NAMES[0]}|PART_OF|二级邻域实体|mock-chunk-9`,
      source: MOCK_NAMES[0],
      target: '二级邻域实体',
      type: 'PART_OF',
      confidence: 0.7,
      sourceChunkId: 'mock-chunk-9',
    });
  }

  return { focus: center, nodes, edges, truncated: false };
}

/** 实体联想：q 缺省时返回热门实体，用于输入提示与空白引导。 */
export async function suggestEntities(input: EntitySuggestRequest = {}): Promise<{ items: GraphEntitySuggestion[] }> {
  const params = new URLSearchParams();
  const q = input.q?.trim();
  if (q) params.set('q', q);
  if (input.types?.length) params.set('types', input.types.join(','));
  if (input.limit) params.set('limit', String(input.limit));

  if (appConfig.enableMockApi) return mockSuggest(q);
  const query = params.toString();
  return request<{ items: GraphEntitySuggestion[] }>(`/graph/entities${query ? `?${query}` : ''}`);
}

/** 邻域展开：返回可交互探索的图谱视图（节点 id 为 normalizedName）。 */
export async function fetchNeighborhood(input: NeighborhoodRequest): Promise<GraphView> {
  const payload: NeighborhoodRequest = {
    entity: input.entity,
    ...(input.maxHops ? { maxHops: input.maxHops } : {}),
    ...(input.entityTypes?.length ? { entityTypes: input.entityTypes } : {}),
    ...(input.relationTypes?.length ? { relationTypes: input.relationTypes } : {}),
    ...(input.datasetIds?.length ? { datasetIds: input.datasetIds } : {}),
    ...(input.limit ? { limit: input.limit } : {}),
  };

  if (appConfig.enableMockApi) return mockNeighborhood(payload.entity, payload.maxHops ?? 1);
  return jsonRequest<GraphView>('/graph/neighborhood', 'POST', payload);
}

/** 回答相关图谱：入口是本轮引用的 chunk（回答侧没有实体名可用）。 */
export async function fetchAnswerContext(input: AnswerContextRequest): Promise<GraphView> {
  if (appConfig.enableMockApi) return mockNeighborhood('本轮引用', 1);
  return jsonRequest<GraphView>('/graph/answer-context', 'POST', {
    chunkIds: input.chunkIds,
    ...(input.limit ? { limit: input.limit } : {}),
  });
}
