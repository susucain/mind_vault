export type MemoryKind = 'preference' | 'fact' | 'goal';

export type MemoryStatus = 'ACTIVE' | 'SUPERSEDED';

export interface MemoryItem {
  id: string;
  content: string;
  kind: MemoryKind;
  status: MemoryStatus;
  hitCount: number;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sourceConversationId?: string | null;
}

export interface ListMemoriesResponse {
  items: MemoryItem[];
}

export interface ClearMemoriesResponse {
  deleted: number;
}
