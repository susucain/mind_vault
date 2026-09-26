import { z } from 'zod';

/**
 * 长期记忆配置。
 * 记忆条目是"关于用户的稳定事实与偏好"，与资料检索严格分离：
 * 条目短、语义集中，所以召回阈值比资料门控（0.75）略高。
 */
export const memoryConfig = {
  recallTopK: 3,
  minRecallScore: 0.8,
  /** 写入时视为同一事实的重复表述阈值，命中则更新而不是新增 */
  minDuplicateScore: 0.92,
  /** 同主题但表述不同：新条目生效，旧条目标记 SUPERSEDED 不再召回 */
  minRelatedScore: 0.75,
  maxActivePerUser: 200,
  maxContentChars: 200,
  /** 自动抽取：单次最多入库条数，低于置信度阈值直接丢弃 */
  extractTopN: 3,
  minExtractConfidence: 0.6,
};

export type MemoryKind = 'preference' | 'fact' | 'goal';

export type MemoryStatus = 'ACTIVE' | 'SUPERSEDED';

export interface MemoryItem {
  id: string;
  content: string;
  kind: MemoryKind;
  score: number;
}

/** 不经向量召回的取用结果：没有相似度可谈，只带内容与类型 */
export type MemoryNote = Omit<MemoryItem, 'score'>;

export interface ExtractedMemory {
  content: string;
  kind: MemoryKind;
  confidence: number;
}

export type ExplicitMemoryAction =
  | 'none'
  | 'saved'
  | 'not_saved'
  | 'clarification_required'
  | 'forgotten'
  | 'queried'
  | 'failed';

export interface ExplicitMemoryResult {
  action: ExplicitMemoryAction;
  content?: string;
  answer?: string;
  memories?: MemoryNote[];
}

// 非法值用 catch 降级：抽取失败宁可少记一条，也不能让整轮问答出问题
export const extractSchema = z.object({
  memories: z
    .array(
      z.object({
        content: z.string().catch(''),
        kind: z.enum(['preference', 'fact', 'goal']).catch('fact'),
        confidence: z.number().min(0).max(1).catch(0.5),
      }),
    )
    .catch([]),
});

export const explicitMemorySchema = z.object({
  content: z.string().catch(''),
  kind: z.enum(['preference', 'fact', 'goal']).catch('fact'),
});
