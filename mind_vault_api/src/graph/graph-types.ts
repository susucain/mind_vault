import { z } from 'zod';

export const entityTypeSchema = z.enum([
  'PERSON',
  'PROJECT',
  'TECHNOLOGY',
  'CONCEPT',
  'ORGANIZATION',
  'EVENT',
]);

export const relationTypeSchema = z.enum([
  'USES',
  'USED_FOR',
  'DEPENDS_ON',
  'CAUSES',
  'RELATED_TO',
  'PART_OF',
  'CREATED_BY',
  'MENTIONED_WITH',
]);

export const extractionSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        type: entityTypeSchema,
      }),
    )
    .max(30),
  relations: z
    .array(
      z.object({
        source: z.string().min(1).max(120),
        target: z.string().min(1).max(120),
        type: relationTypeSchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(50),
});

export type GraphExtraction = z.infer<typeof extractionSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;
export type RelationType = z.infer<typeof relationTypeSchema>;

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
