import type { Citation, ChatMessage } from '../../types/domain';
import type { StreamEvent } from '../../hooks/use-sse';

export type ChatStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error' | 'interrupted';

export interface ChatDraft {
  id: string;
  conversationId: string;
  role: 'assistant';
  content: string;
  citations: Citation[];
  createdAt: string;
  tokens: number;
  status: ChatStatus;
  backendStage: string;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface ChatState {
  messages: ChatMessage[];
  draft?: ChatDraft;
  status: ChatStatus;
  backendStage: string;
  error?: string;
  result?: unknown;
}

export type ChatAction =
  | { type: 'history'; messages: ChatMessage[] }
  | { type: 'begin'; conversationId: string; user: ChatMessage }
  | { type: 'resume' }
  | { type: 'event'; event: StreamEvent }
  | { type: 'interrupted' }
  | { type: 'failed'; message: string };

export function initialChatState(messages: ChatMessage[] = []): ChatState {
  return { messages, status: 'idle', backendStage: '' };
}

function ensureDraft(state: ChatState): ChatDraft {
  return state.draft ?? {
    id: `draft-${Date.now()}`,
    conversationId: state.messages[0]?.conversationId ?? '',
    role: 'assistant',
    content: '',
    citations: [],
    createdAt: new Date().toISOString(),
    tokens: 0,
    status: 'streaming',
    backendStage: '',
  };
}

function resultAnswer(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const value = result as Record<string, unknown>;
  for (const key of ['answer', 'content', 'text']) {
    if (typeof value[key] === 'string') return value[key];
  }
  return undefined;
}

function resultCitations(result: unknown): Citation[] {
  if (!result || typeof result !== 'object') return [];
  const citations = (result as Record<string, unknown>).citations;
  return Array.isArray(citations)
    ? citations
      .filter((item): item is Citation & { quote?: string } => Boolean(item && typeof item === 'object' && 'id' in item))
      .map((citation) => ({
        ...citation,
        // 文档名由后端解析下发；缺失时留空，由卡片显示中性占位而不是 ID
        documentName: citation.documentName ?? '',
        excerpt: citation.excerpt || citation.quote || '',
      }))
    : [];
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'history':
      return { ...initialChatState(action.messages), status: action.messages.length ? 'done' : 'idle' };
    case 'begin':
      return { ...state, messages: [...state.messages, action.user], draft: undefined, status: 'loading', error: undefined };
    case 'resume':
      return state.draft
        ? { ...state, status: 'loading', error: undefined, draft: { ...state.draft, status: 'streaming', error: undefined } }
        : { ...state, status: 'loading', error: undefined };
    case 'interrupted':
      return state.draft ? { ...state, status: 'interrupted', draft: { ...state.draft, status: 'interrupted' } } : { ...state, status: 'interrupted' };
    case 'failed':
      return state.draft
        ? { ...state, status: 'error', error: action.message, draft: { ...state.draft, status: 'error', error: action.message } }
        : { ...state, status: 'error', error: action.message };
    case 'event': {
      const event = action.event;
      const draft = ensureDraft(state);
      if (event.type === 'message_start') return { ...state, status: 'streaming', draft: { ...draft, id: event.messageId || draft.id, meta: event.meta } };
      if (event.type === 'token') return { ...state, status: 'streaming', draft: { ...draft, content: draft.content + event.content, tokens: draft.tokens + event.content.length, status: 'streaming' } };
      if (event.type === 'citation') return { ...state, draft: { ...draft, citations: draft.citations.some((item) => item.id === event.citation.id) ? draft.citations : [...draft.citations, event.citation] } };
      if (event.type === 'status') return { ...state, status: event.status === 'answering' ? 'streaming' : 'loading', backendStage: event.backendStage, draft: { ...draft, backendStage: event.backendStage } };
      if (event.type === 'error') return { ...state, status: 'error', error: event.message, draft: { ...draft, status: 'error', error: event.message } };
      if (event.type === 'done') return { ...state, status: 'done', backendStage: 'done', draft: { ...draft, status: 'done', backendStage: 'done' } };
      if (event.type === 'result') {
        const answer = resultAnswer(event.result);
        const citations = resultCitations(event.result);
        const mergedCitations = [...draft.citations];
        for (const citation of citations) {
          if (!mergedCitations.some((item) => item.id === citation.id)) mergedCitations.push(citation);
        }
        return {
          ...state,
          status: 'streaming',
          result: event.result,
          draft: {
            ...draft,
            content: answer ?? draft.content,
            tokens: answer ? answer.length : draft.tokens,
            citations: mergedCitations,
            status: 'streaming',
          },
        };
      }
      return state;
    }
  }
}

export function materializeDraft(state: ChatState): ChatMessage[] {
  if (!state.draft?.content) return state.messages;
  const { id, conversationId, role, content, citations, createdAt } = state.draft;
  return [...state.messages, { id, conversationId, role, content, citations, createdAt }];
}
