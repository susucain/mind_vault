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
  citations: ChatCitation[];
}

export interface ChatStreamMeta extends Record<string, unknown> {
  messageId: string;
  usedTools: string[];
  model?: string;
  thinking: boolean;
}

export interface DatasetChoice extends Dataset {
  selected: boolean;
}
