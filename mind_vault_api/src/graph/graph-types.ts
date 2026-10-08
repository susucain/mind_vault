import { z } from 'zod';

export const entityTypeSchema = z.enum([
  'PERSON',
  'PROJECT',
  'TECHNOLOGY',
  'CONCEPT',
  'ORGANIZATION',
  'EVENT',
]);

/** 关系类型白名单。Neo4j 关系类型无法参数化，批量写入时按类型分组并据此校验。 */
export const RELATION_TYPES = [
  'USES',
  'USED_FOR',
  'DEPENDS_ON',
  'CAUSES',
  'RELATED_TO',
  'PART_OF',
  'CREATED_BY',
  'MENTIONED_WITH',
] as const;

export const relationTypeSchema = z.enum(RELATION_TYPES);

export const extractionSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        type: entityTypeSchema,
      }),
    )
    // 实际上限由配置决定（graph.maxEntities），这里只兜底防爆量输出
    .max(200),
  relations: z
    .array(
      z.object({
        source: z.string().min(1).max(120),
        target: z.string().min(1).max(120),
        type: relationTypeSchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(400),
});

export type GraphExtraction = z.infer<typeof extractionSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;
export type RelationType = z.infer<typeof relationTypeSchema>;

/** 邻居片段取用的字符数（G1/D10：前后各 200 字） */
export const NEIGHBOR_CONTEXT_CHARS = 200;

/**
 * 抽取输入（G1）：除正文外补充文档标题、章节路径、片段序号与邻居片段，
 * 让模型看到上下文，减少「本文/该项目/它」这类指代与泛化实体。
 */
export interface GraphExtractionInput {
  chunkId: string;
  ownerId: string;
  documentId: string;
  documentVersion: number;
  text: string;
  documentTitle?: string;
  titlePath?: string[];
  /** 片段在文档内的序号（从 0 起），用于 prompt 里标注「第 N 段」 */
  chunkOrder?: number;
  previousText?: string;
  nextText?: string;
}

/** 因 prompt 上限被截断的数量（G3）：用于判断抽取上限是否过紧 */
export interface GraphTruncation {
  entities: number;
  relations: number;
}

export interface GraphExtractionResult {
  extraction: GraphExtraction;
  truncated: GraphTruncation;
}

/** 关系被丢弃的原因分类（G3） */
export interface GraphRelationDropCounts {
  /** 端点不在本 chunk，且同 owner 下也查不到，只能丢弃 */
  missingEndpoint: number;
  /** 自环（source === target） */
  selfLoop: number;
  /** 关系类型不在白名单 */
  invalidType: number;
}

export interface GraphIndexStats {
  entities: number;
  relations: number;
  dropped: GraphRelationDropCounts;
}

export interface GraphSearchInput {
  ownerId: string;
  entityNames: string[];
  maxHops?: number;
  datasetIds?: string[];
}

/** 图谱可视化视图：节点 id 用 normalizedName（稳定、可作 React key），name 为展示名 */
export interface GraphViewNode {
  id: string;
  name: string;
  type: string;
  /** 在当前返回子图中的关联边数（用于节点大小与筛选） */
  degree: number;
  isFocus?: boolean;
  /** 被归一合并的原始写法（G2 展示层），如「Elasticsearch (ES)」 */
  aliases?: string[];
}

/** 关系没有独立 id，用 source|type|target|sourceChunkId 四元组区分 */
export interface GraphViewEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence?: number;
  sourceChunkId?: string;
}

export interface GraphView {
  focus: string;
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  truncated: boolean;
}

export interface GraphNeighborhoodInput {
  ownerId: string;
  entities: string[];
  maxHops?: number;
  entityTypes?: string[];
  relationTypes?: string[];
  datasetIds?: string[];
  limit?: number;
}

export interface GraphEntitySuggestionInput {
  ownerId: string;
  q?: string;
  types?: string[];
  limit?: number;
}

/**
 * 回答相关图谱的入参：回答侧只有引用片段，没有实体名，
 * 因此入口是这批 chunk 被提及的实体，而不是 neighborhood 的实体名。
 */
export interface GraphAnswerContextInput {
  ownerId: string;
  chunkIds: string[];
  limit?: number;
}

export interface GraphEntitySuggestion {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
}
