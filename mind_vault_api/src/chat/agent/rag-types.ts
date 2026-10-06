import { z } from 'zod';
import { RetrievalHit } from '../../retrieval/retrieval-hit';
import { MemoryItem } from '../../memory/memory.types';

// 枚举字段用 catch 降级：模型返回非法值时回落到默认档，避免整个问答请求失败
export const routeSchema = z.object({
  intent: z.enum(['lookup', 'semantic', 'graph', 'compare']).catch('semantic'),
  complexity: z.enum(['low', 'medium', 'high']).catch('medium'),
  entityNames: z.array(z.string().min(1)).max(10),
});

export type RagRoute = z.infer<typeof routeSchema>;

export const rewriteSchema = z.object({
  // 模型返回非法值时回退空串，由调用方决定是否沿用原问题
  query: z.string().catch(''),
});

export const summarySchema = z.object({
  // 压缩失败时回退空串，由调用方保留原摘要并等待下次重算
  summary: z.string().catch(''),
});

/**
 * rag      基于资料回答
 * general  通用知识回答：资料无依据时自动补答（正文自带来源提示行，不产出引用）
 */
export type AnswerMode = 'rag' | 'general';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 短期记忆配置：窗口只保留最近若干轮，并限制单条与总量字符数。
 * 历史读取（chat.service）与 prompt 组装（rag-agent）共用这份配置，
 * 避免两处窗口大小不一致。
 * summarizeBatch 是压缩阈值：滑出窗口且未摘要的消息攒够这么多条才重算摘要，
 * 否则每轮追问都要多付一次模型调用。
 */
export const historyWindow = {
  maxMessages: 8,
  maxCharsPerMessage: 500,
  maxChars: 2000,
  summarizeBatch: 4,
};

export interface RagState {
  ownerId: string;
  question: string;
  /** 更早轮次压缩出的摘要，仅作背景，不能作为引用依据 */
  summary?: string;
  history: HistoryTurn[];
  /** 长期记忆：关于用户的稳定事实与偏好，只影响表述，不参与是否有证据的判定 */
  memories: MemoryItem[];
  datasetIds: string[];
  route?: RagRoute;
  hits: RetrievalHit[];
  vectorHits: RetrievalHit[];
  hasEvidence: boolean;
  usedTools: string[];
  answer?: string;
  citedChunkIds: string[];
  model?: string;
  thinking: boolean;
  answerMode: AnswerMode;
}
