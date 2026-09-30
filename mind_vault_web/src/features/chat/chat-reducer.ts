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

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'history':
      return { ...initialChatState(action.messages), status: action.messages.length ? 'done' : 'idle' };
    case 'begin':
      return { ...state, messages: [...state.messages, action.user], draft: undefined, status: 'loading', error: undefined };
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
      if (event.type === 'result') return { ...state, result: event.result };
      return state;
    }
  }
}

export function materializeDraft(state: ChatState): ChatMessage[] {
  if (!state.draft?.content) return state.messages;
  const { id, conversationId, role, content, citations, createdAt } = state.draft;
  return [...state.messages, { id, conversationId, role, content, citations, createdAt }];
}
