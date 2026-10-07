import type { Citation, ChatMessage } from '../../types/domain';
import type { StreamEvent } from '../../hooks/use-sse';

export type ChatStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error' | 'interrupted';

export interface ChatDraft {
  id: string;
  conversationId: string;
  role: 'assistant';
  content: string;
  citations: Citation[];
  suggestions: string[];
  createdAt: string;
  tokens: number;
  status: ChatStatus;
  backendStage: string;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface ChatState {
  /**
   * 按会话缓存消息。切换会话时直接取缓存渲染，不再「先清空 → 再填充」——
   * 这是「切换会话不闪烁」的关键：骨架常驻，内容原地替换。
   */
  byConversation: Record<string, ChatMessage[]>;
  /** 正在生成的草稿；同一时刻只有一个会话在生成 */
  draft?: ChatDraft;
  status: ChatStatus;
  backendStage: string;
  error?: string;
  result?: unknown;
}

export type ChatAction =
  | { type: 'history'; conversationId: string; messages: ChatMessage[] }
  | { type: 'begin'; conversationId: string; user: ChatMessage }
  | { type: 'resume' }
  | { type: 'event'; conversationId: string; event: StreamEvent }
  | { type: 'settle' }
  | { type: 'interrupted' }
  | { type: 'failed'; message: string }
  | { type: 'discard' };

export function initialChatState(): ChatState {
  return { byConversation: {}, status: 'idle', backendStage: '' };
}

/** 某个会话已缓存的消息（未访问过则为空数组） */
export function messagesOf(state: ChatState, conversationId?: string): ChatMessage[] {
  return conversationId ? state.byConversation[conversationId] ?? [] : [];
}

/** 某个会话正在生成的草稿；其它会话的草稿不返回，避免串台 */
export function draftOf(state: ChatState, conversationId?: string): ChatDraft | undefined {
  return state.draft && state.draft.conversationId === conversationId ? state.draft : undefined;
}

function createDraft(conversationId: string): ChatDraft {
  return {
    id: `draft-${Date.now()}`,
    conversationId,
    role: 'assistant',
    content: '',
    citations: [],
    suggestions: [],
    createdAt: new Date().toISOString(),
    tokens: 0,
    status: 'loading',
    backendStage: '',
  };
}

function ensureDraft(state: ChatState, conversationId: string): ChatDraft {
  return state.draft ?? createDraft(conversationId);
}

/**
 * 用服务端历史替换缓存时，按 `role + 内容` 找回本地 key：
 * 乐观插入的用户消息、已落定的助手消息都保留原 id，
 * 整列 React key 不变 → 不会整列卸载重建。
 */
function alignIds(previous: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (!previous.length) return incoming;
  const pool = [...previous];
  return incoming.map((message) => {
    const index = pool.findIndex(
      (candidate) => candidate.role === message.role && candidate.content === message.content,
    );
    if (index === -1) return message;
    const [matched] = pool.splice(index, 1);
    return matched.id === message.id ? message : { ...message, id: matched.id };
  });
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
    case 'history': {
      // 该会话正在生成：服务端历史必然落后于本地乐观消息，等落定后再同步
      if (state.draft?.conversationId === action.conversationId) return state;
      const previous = state.byConversation[action.conversationId] ?? [];
      // 请求是在落定前发出的、回来时已经更短的历史属于旧快照，不能反过来覆盖本地
      if (action.messages.length < previous.length) return state;
      const messages = alignIds(previous, action.messages);
      return {
        ...state,
        byConversation: { ...state.byConversation, [action.conversationId]: messages },
        status: messages.length ? 'done' : 'idle',
        error: undefined,
      };
    }
    case 'begin':
      return {
        ...state,
        byConversation: {
          ...state.byConversation,
          [action.conversationId]: [
            ...(state.byConversation[action.conversationId] ?? []),
            action.user,
          ],
        },
        draft: createDraft(action.conversationId),
        status: 'loading',
        error: undefined,
      };
    case 'resume':
      return state.draft
        ? { ...state, status: 'loading', error: undefined, draft: { ...state.draft, status: 'streaming', error: undefined } }
        : { ...state, status: 'loading', error: undefined };
    case 'settle': {
      const draft = state.draft;
      // 只有正常收尾才落定；中断 / 失败时保留草稿，交给「继续生成 / 重试」处理
      if (!draft || draft.status !== 'done') return state;
      const settled: ChatMessage = {
        // 沿用草稿 id（`meta` 事件下发的就是服务端消息 id），同 key 同类型 → 原地替换
        id: draft.id,
        conversationId: draft.conversationId,
        role: 'assistant',
        content: draft.content,
        citations: draft.citations,
        suggestions: draft.suggestions,
        createdAt: draft.createdAt,
      };
      return {
        ...state,
        byConversation: {
          ...state.byConversation,
          [draft.conversationId]: [...(state.byConversation[draft.conversationId] ?? []), settled],
        },
        draft: undefined,
        status: 'done',
        backendStage: 'done',
      };
    }
    case 'discard':
      return { ...state, draft: undefined, status: 'idle', backendStage: '', error: undefined };
    case 'interrupted':
      return state.draft ? { ...state, status: 'interrupted', draft: { ...state.draft, status: 'interrupted' } } : { ...state, status: 'interrupted' };
    case 'failed':
      return state.draft
        ? { ...state, status: 'error', error: action.message, draft: { ...state.draft, status: 'error', error: action.message } }
        : { ...state, status: 'error', error: action.message };
    case 'event': {
      const event = action.event;
      const draft = ensureDraft(state, action.conversationId);
      if (event.type === 'message_start') return { ...state, status: 'streaming', draft: { ...draft, id: event.messageId || draft.id, meta: event.meta } };
      if (event.type === 'token') return { ...state, status: 'streaming', draft: { ...draft, content: draft.content + event.content, tokens: draft.tokens + event.content.length, status: 'streaming' } };
      if (event.type === 'citation') return { ...state, draft: { ...draft, citations: draft.citations.some((item) => item.id === event.citation.id) ? draft.citations : [...draft.citations, event.citation] } };
      if (event.type === 'suggestions') return { ...state, draft: { ...draft, suggestions: event.items } };
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