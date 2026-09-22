import { Dataset } from './api';

export interface Conversation {
  id: string;
  title: string;
  datasetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatCitation {
  id: string;
  documentId: string;
  chunkId: string;
  quote: string;
  locator: Record<string, unknown>;
  rank: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usedTools: string[];
  model?: string | null;
  thinking: boolean;
  confidence?: number | null;
  status?: 'COMPLETED' | 'ABORTED' | 'FAILED';
  answerMode?: 'rag' | 'general';
  citations: ChatCitation[];
}

export interface ChatStreamMeta extends Record<string, unknown> {
  messageId: string;
  usedTools: string[];
  model?: string;
  thinking: boolean;
  /** rag：回答基于资料命中；general：资料无依据，改由模型通用知识作答 */
  answerMode?: 'rag' | 'general';
}

export interface DatasetChoice extends Dataset {
  selected: boolean;
}
