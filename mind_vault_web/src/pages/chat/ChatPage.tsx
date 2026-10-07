import { useEffect, useReducer, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ChevronsUpDown, Copy, FileText, Layers, Menu, MessageSquarePlus, Pause, RefreshCw, Search, Send, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createConversation, createMessageStreamRequest, getConversation, listConversations, listMessages, updateConversation } from '../../api/conversations';
import { listDatasets } from '../../api/datasets';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/shadcn/ui/popover';
import { Button, Drawer, EmptyState, ErrorState, StatusBadge } from '../../components/ui';
import { CitationCard, MarkdownViewer, MessageGraph, chatReducer, draftOf, initialChatState, messagesOf, type ChatDraft } from '../../features/chat';
import { useSse, type StreamEvent } from '../../hooks/use-sse';
import { useStickyScroll } from '../../hooks/use-sticky-scroll';
import type { ChatMessage, Citation, Conversation, Dataset } from '../../types/domain';

const PAGE_SIZE = 20;
/** 兜底推荐问题：新会话、追问推荐被关闭或生成失败时用它，保证问题区永不空白 */
const fallbackPrompts = ['总结这组资料的关键结论', '对比不同方案的优缺点', '给我一个可执行的复习计划'];

/** 后端阶段 key → 中文文案；未知阶段原样显示，避免出现空白徽标 */
const STAGE_LABEL: Record<string, string> = {
  preparing: '准备中',
  rewrite: '理解上下文',
  recall: '回忆偏好',
  classify: '判断意图',
  gate: '判断是否有依据',
  retrieve: '检索资料',
  answer: '生成回答',
  suggest: '整理后续追问',
};

function stageLabel(stage?: string) {
  if (!stage) return '生成中';
  return STAGE_LABEL[stage] ?? stage;
}

/** 乐观插入的本地用户消息；服务端历史回来后由 alignIds 沿用这个 id（见 chat-reducer） */
function localUserMessage(conversationId: string, content: string): ChatMessage {
  return {
    id: `local-${Date.now()}`,
    conversationId,
    role: 'user',
    content,
    citations: [],
    createdAt: new Date().toISOString(),
  };
}

function formatHistoryDate(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const sameDay = value.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat('zh-CN', sameDay ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' }).format(value);
}

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface ConversationHistoryProps {
  activeId?: string;
  items: Conversation[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/** 会话历史：搜索 + 触底加载更多。列表自身滚动，不影响页面其它区域。 */
function ConversationHistory({ activeId, items, search, onSearchChange, onSelect, onNew, isPending, isError, onRetry, hasNextPage, isFetchingNextPage, onLoadMore }: ConversationHistoryProps) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    }, { rootMargin: '140px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, onLoadMore]);

  return (
    <div className="chat-history">
      <Button className="chat-new-button" onClick={onNew} type="button"><MessageSquarePlus size={17} />开启新对话</Button>
      <label className="chat-history__search">
        <Search aria-hidden="true" size={15} />
        <input aria-label="搜索会话" className="input" onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索会话名称或内容…" type="search" value={search} />
      </label>
      <div className="chat-history__heading"><h2>会话历史</h2>{!isPending && !isError ? <span className="chat-history__count">{items.length}</span> : null}</div>
      <div className="chat-history-list">
        {isPending ? <p className="chat-history-hint">正在加载会话…</p> : isError ? (
          <div className="chat-history-hint"><span>历史加载失败</span><button className="chat-history-retry" onClick={onRetry} type="button">重试</button></div>
        ) : !items.length ? (
          <p className="chat-history-hint">{search ? '没有匹配的会话' : '还没有会话，开启一段新对话吧。'}</p>
        ) : (
          <>
            {items.map((item) => (
              <button className={`chat-history-item${item.id === activeId ? ' is-active' : ''}`} key={item.id} onClick={() => onSelect(item.id)} type="button">
                <span className="chat-history-item__title">{item.title || '新对话'}</span>
                <span className="chat-history-item__meta">
                  {item.favorite ? <Star aria-label="已收藏" className="chat-history-item__star" fill="currentColor" role="img" size={12} /> : null}
                  <time dateTime={item.updatedAt}>{formatHistoryDate(item.updatedAt)}</time>
                </span>
              </button>
            ))}
            {hasNextPage ? <div className="chat-history-sentinel" ref={sentinel}>{isFetchingNextPage ? '正在加载更多…' : ''}</div> : items.length > PAGE_SIZE ? <p className="chat-history-hint chat-history-end">没有更多会话了</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

/** 资料集范围：默认「全部资料集」（空范围），可勾选具体资料集。 */
function ScopePicker({ datasets, value, onChange, applying }: { datasets: Dataset[]; value: string[]; onChange: (ids: string[]) => void; applying: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const all = draft.length === 0;
  // 触发器文案以外部值为准；draft 仅用于弹层内的勾选编辑，每次打开时再同步。
  const label = value.length === 0 ? '全部资料集' : value.length === 1 ? datasets.find((dataset) => dataset.id === value[0])?.name ?? '1 个资料集' : `${value.length} 个资料集`;

  return (
    <Popover onOpenChange={(next) => { setOpen(next); if (next) setDraft(value); }} open={open}>
      <PopoverTrigger asChild>
        <button aria-label={`资料集范围：${label}`} className="chat-scope-trigger" type="button">
          <Layers aria-hidden="true" size={15} />
          <span className="chat-scope-trigger__label">{label}</span>
          <ChevronsUpDown aria-hidden="true" size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="chat-scope-menu">
        <p className="chat-scope-menu__title">检索资料集</p>
        <div className="chat-scope-options">
          <label className="chat-scope-option">
            <input checked={all} onChange={() => setDraft([])} type="checkbox" />
            <span className="chat-scope-option__name">全部资料集</span>
          </label>
          <div className="chat-scope-divider" />
          {datasets.length ? datasets.map((dataset) => (
            <label className="chat-scope-option" key={dataset.id}>
              <input checked={draft.includes(dataset.id)} onChange={(event) => setDraft((ids) => event.target.checked ? [...ids, dataset.id] : ids.filter((id) => id !== dataset.id))} type="checkbox" />
              <span className="chat-scope-option__name">{dataset.name}</span>
              <span className="chat-scope-option__count">{dataset.documentCount ?? 0} 份</span>
            </label>
          )) : <p className="chat-scope-empty">还没有可用资料集</p>}
        </div>
        <div className="chat-scope-actions">
          <span className="chat-scope-hint">不选具体资料集时检索全部</span>
          <Button className="button--sm" disabled={applying} onClick={() => { onChange(draft); setOpen(false); }} type="button">应用</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 轮次内联引用：把该轮回答用到的原文直接展示在消息下方。 */
function MessageCitations({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <section aria-label="引用原文" className="message-citations">
      <p className="message-citations__title"><FileText aria-hidden="true" size={13} />引用原文 · {citations.length}</p>
      <div className="message-citations__list">
        {citations.map((citation) => <CitationCard citation={citation} key={citation.id} />)}
      </div>
      <MessageGraph citations={citations} />
    </section>
  );
}

/**
 * 展示模型：正式消息与流式草稿共用一份形状。
 * 草稿落定时只是去掉 `streaming/stage/error` 三个可选字段，id 与组件类型都不变，
 * React 原地更新而不是卸载重建——这是「回答收尾不闪」的关键。
 */
type BubbleModel = ChatMessage & { streaming?: boolean; stage?: string; error?: string };

function toBubble(draft: ChatDraft): BubbleModel {
  return {
    id: draft.id,
    conversationId: draft.conversationId,
    role: 'assistant',
    content: draft.content,
    citations: draft.citations,
    createdAt: draft.createdAt,
    streaming: draft.status === 'loading' || draft.status === 'streaming',
    stage: draft.backendStage,
    error: draft.error,
  };
}

function MessageBubble({ message }: { message: BubbleModel }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down'>();
  const isUser = message.role === 'user';
  return (
    <article className={`message-bubble message-bubble--${message.role}`}>
      <div className="message-bubble__avatar">{isUser ? '我' : <Bot size={17} />}</div>
      <div className="message-bubble__body">
        {/* 播报范围只圈住阶段徽标：若把流式正文放进 live region，会逐字播报，反而不可用 */}
        {isUser ? null : <span className="message-bubble__role">Mind Vault {message.streaming ? <span aria-live="polite" role="status"><StatusBadge tone="warning">{stageLabel(message.stage)}</StatusBadge></span> : null}</span>}
        {isUser ? <p>{message.content}</p> : <><MarkdownViewer content={message.content} isAnimating={message.streaming} /><MessageCitations citations={message.citations} /></>}
        {message.error ? <p className="form-error">{message.error}</p> : null}
        <div className="message-actions">
          <button aria-label="复制回答" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopied(true); }} type="button"><Copy size={14} />{copied ? '已复制' : '复制'}</button>
          {isUser ? null : <><button aria-label="回答有帮助" className={feedback === 'up' ? 'is-selected' : ''} onClick={() => setFeedback('up')} type="button"><ThumbsUp size={14} /></button><button aria-label="回答没帮助" className={feedback === 'down' ? 'is-selected' : ''} onClick={() => setFeedback('down')} type="button"><ThumbsDown size={14} /></button></>}
        </div>
      </div>
    </article>
  );
}

/** 会话加载骨架：与真实气泡同宽同高，避免「占位 → 内容」时整个列表跳一下 */
function MessageSkeleton() {
  return (
    <div aria-busy="true" className="chat-skeleton">
      {[0, 1].map((row) => (
        <div className="chat-skeleton__row" key={row}>
          <span className="chat-skeleton__avatar" />
          <div className="chat-skeleton__bars">
            <span className="chat-skeleton__bar" />
            <span className="chat-skeleton__bar" />
            <span className="chat-skeleton__bar" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatPage({ isNew = false }: { isNew?: boolean }) {
  const { conversationId: routeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createdConversationId, setCreatedConversationId] = useState<string>();
  const [state, dispatch] = useReducer(chatReducer, initialChatState());
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [scopeEdits, setScopeEdits] = useState<Record<string, string[]>>({});
  const [favoriteError, setFavoriteError] = useState<string>();
  const [lastPrompt, setLastPrompt] = useState('');
  // 每次自增表示「请求把光标落到输入框末尾」；用信号而不是直接操作 DOM，
  // 保证光标是在 React 提交了新值之后才设置的
  const [focusSignal, setFocusSignal] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const sse = useSse();

  const conversationId = routeId ?? (isNew ? undefined : createdConversationId);
  // 新建会话时路由还没跟上，用草稿归属的会话兜底，避免「已发出但一帧空白」
  const activeId = conversationId ?? state.draft?.conversationId;
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);

  const conversations = useInfiniteQuery({
    queryKey: ['chat', 'conversations', debouncedSearch],
    queryFn: ({ pageParam }) => listConversations({ q: debouncedSearch || undefined, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.page + 1 : undefined),
  });
  const conversationItems = conversations.data?.pages.flatMap((page) => page.items) ?? [];

  const conversation = useQuery({ enabled: Boolean(conversationId), queryKey: ['chat', 'conversation', conversationId], queryFn: () => getConversation(conversationId!) });
  // keepPreviousData：切换会话时沿用上一批消息而不是回到 pending，配合按会话缓存做到「骨架不卸载」
  const messages = useQuery({ enabled: Boolean(conversationId), queryKey: ['chat', 'messages', conversationId], queryFn: () => listMessages(conversationId!), placeholderData: keepPreviousData });
  const datasets = useQuery({ queryKey: ['chat', 'datasets'], queryFn: () => listDatasets({ pageSize: 50 }) });
  const create = useMutation({ mutationFn: createConversation });
  const updateScope = useMutation({
    mutationFn: (ids: string[]) => updateConversation(conversationId!, { datasetIds: ids }),
    onSuccess: (updated) => {
      // 服务端真值直接回填，避免「乐观值 → 失效重取」之间闪回旧范围
      queryClient.setQueryData(['chat', 'conversation', conversationId], updated);
      setScopeEdits((edits) => {
        if (!conversationId) return edits;
        const next = { ...edits };
        delete next[conversationId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
  // 收藏：先就地乐观回填，失败回滚并给出可读提示；成功后回填服务端真值并刷新侧栏
  const updateFavorite = useMutation({
    mutationFn: (next: boolean) => updateConversation(conversationId!, { favorite: next }),
    onMutate: async (next) => {
      const key = ['chat', 'conversation', conversationId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Conversation>(key);
      setFavoriteError(undefined);
      if (previous) queryClient.setQueryData<Conversation>(key, { ...previous, favorite: next });
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous) queryClient.setQueryData<Conversation>(['chat', 'conversation', conversationId], context.previous);
      setFavoriteError(error instanceof Error ? error.message : '收藏失败，请重试');
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Conversation>(['chat', 'conversation', conversationId], updated);
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });

  const activeConversation = conversation.data;
  const visibleMessages = messagesOf(state, activeId);
  const visibleDraft = draftOf(state, activeId);
  const bubbles: BubbleModel[] = visibleDraft ? [...visibleMessages, toBubble(visibleDraft)] : visibleMessages;

  // 服务端历史只在它确实属于当前会话时写入缓存：placeholder 是上一个会话的数据
  useEffect(() => {
    if (!conversationId || !messages.data || messages.isPlaceholderData) return;
    dispatch({ type: 'history', conversationId, messages: messages.data });
  }, [conversationId, messages.data, messages.isPlaceholderData]);

  // 粘底：内容变化时跟随，用户上滑阅读时不打断；流式增量用瞬时滚动，避免动画互相打断
  const scrollRef = useStickyScroll(`${bubbles.length}:${visibleDraft?.content.length ?? 0}`, !visibleDraft);

  // 点推荐问题：填充输入框 + 聚焦 + 光标置尾，不自动发送（避免误发，用户可按回车）
  useEffect(() => {
    if (!focusSignal) return;
    const node = composerRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [focusSignal]);

  const datasetItems = datasets.data?.items ?? [];
  // 范围以服务端为准，用户刚应用、服务端还没回来的编辑值优先
  const selectedDatasets = scopeEdits[conversationId ?? ''] ?? activeConversation?.datasetIds ?? [];
  // 标题优先取列表缓存里已有的名字，避免切会话时闪回「新对话」
  const headerTitle = activeConversation?.title || conversationItems.find((item) => item.id === conversationId)?.title || '新对话';
  const isFavorite = activeConversation?.favorite ?? false;
  const draftStatus = visibleDraft?.status;
  const busy = draftStatus === 'loading' || draftStatus === 'streaming';
  // 草稿错误按归属会话显示；连会话都没建成（无草稿）时回落到全局错误
  const errorText = draftStatus === 'error'
    ? visibleDraft?.error || '回答失败'
    : !state.draft && state.status === 'error'
      ? state.error || '回答失败'
      : undefined;
  const lastQuestion = [...visibleMessages].reverse().find((message) => message.role === 'user')?.content;
  // 会话消息还没到、且本地也没有缓存可显示时才上骨架；有缓存就直接出内容
  const loadingConversation = Boolean(conversationId) && !visibleMessages.length && !visibleDraft && (messages.isPending || messages.isPlaceholderData);
  // 推荐问题取「最后一条助手消息」的产物，因此每轮回答后都会变；
  // 没有产物（新会话 / 开关关闭 / 生成失败 / 条数不足）时回落到通用引导
  const lastAssistant = [...bubbles].reverse().find((message) => message.role === 'assistant');
  const promptChips = lastAssistant?.suggestions?.length ? lastAssistant.suggestions : fallbackPrompts;

  function insertPrompt(prompt: string) {
    setInput(prompt);
    setFocusSignal((signal) => signal + 1);
  }

  async function sendMessage(event?: FormEvent, content = input, mode: 'new' | 'retry' | 'continue' = 'new') {
    event?.preventDefault();
    const question = (mode === 'continue' ? lastPrompt : content).trim();
    if (!question || busy) return;
    if (mode !== 'continue') setLastPrompt(question);
    let id = conversationId;
    try {
      if (!id) {
        const created = await create.mutateAsync({ datasetIds: selectedDatasets, title: question.slice(0, 28) });
        id = created.id;
        setCreatedConversationId(id);
        // 预热缓存：会话标题/范围/空消息立刻可用，新会话首屏不再闪过骨架
        queryClient.setQueryData(['chat', 'conversation', id], created);
        queryClient.setQueryData(['chat', 'messages', id], []);
        void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
        navigate(`/app/chat/${id}`, { replace: true });
      }
      if (mode === 'continue') {
        dispatch({ type: 'resume' });
      } else if (mode === 'new' || !conversationId) {
        dispatch({ type: 'begin', conversationId: id, user: localUserMessage(id, question) });
      }
      setInput('');
      // 固定成 const，闭包里的会话 id 才能保持「已创建」的窄化类型
      const streamId = id;
      const request = createMessageStreamRequest(streamId, question);
      await sse.start(request.path, { init: request.init, onEvent: (streamEvent: StreamEvent) => dispatch({ type: 'event', conversationId: streamId, event: streamEvent }) });
      // 收尾就地落定草稿，不再整表重取——重取会让整列消息换 key 重新挂载，答案文字会重绘一次
      dispatch({ type: 'settle' });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', streamId] });
    } catch (error) {
      dispatch({ type: 'failed', message: error instanceof Error ? error.message : '回答失败' });
    }
  }

  function selectConversation(id: string) {
    setHistoryOpen(false);
    navigate(`/app/chat/${id}`);
  }

  function startNewConversation() {
    setHistoryOpen(false);
    setCreatedConversationId(undefined);
    dispatch({ type: 'discard' });
    setInput('');
    setLastPrompt('');
    setScopeEdits({});
    navigate('/app/chat/new');
  }

  function applyScope(ids: string[]) {
    setScopeEdits((edits) => ({ ...edits, [conversationId ?? '']: ids }));
    if (conversationId) updateScope.mutate(ids);
  }

  const historyPanel = (
    <ConversationHistory
      activeId={conversationId}
      hasNextPage={Boolean(conversations.hasNextPage)}
      isError={conversations.isError}
      isFetchingNextPage={conversations.isFetchingNextPage}
      isPending={conversations.isPending}
      items={conversationItems}
      onLoadMore={() => { if (conversations.hasNextPage && !conversations.isFetchingNextPage) void conversations.fetchNextPage(); }}
      onNew={startNewConversation}
      onRetry={() => void conversations.refetch()}
      onSearchChange={setSearchInput}
      onSelect={selectConversation}
      search={searchInput}
    />
  );

  return (
    <section className="chat-page">
      {historyPanel}
      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header__title">
            <button aria-label="打开会话历史" className="icon-button chat-mobile-only" onClick={() => setHistoryOpen(true)} type="button"><Menu size={19} /></button>
            <div><p className="eyebrow">Mind Vault / 问答</p><h1>{headerTitle}</h1></div>
          </div>
          <div className="chat-header__actions">
            <button aria-label="开启新对话" className="icon-button chat-mobile-only" onClick={startNewConversation} type="button"><MessageSquarePlus size={18} /></button>
            <ScopePicker applying={updateScope.isPending} datasets={datasetItems} onChange={applyScope} value={selectedDatasets} />
            <button aria-label={isFavorite ? '取消收藏' : '收藏会话'} className={`icon-button${isFavorite ? ' is-selected' : ''}`} disabled={!activeConversation || updateFavorite.isPending} onClick={() => updateFavorite.mutate(!isFavorite)} type="button"><Star fill={isFavorite ? 'currentColor' : 'none'} size={17} /></button>
          </div>
        </header>
        <div className="chat-scroll" ref={scrollRef}>
          {favoriteError ? <div className="chat-error" role="alert"><span>{favoriteError}</span></div> : null}
          {conversationId && messages.isError && !messages.isPlaceholderData && !visibleMessages.length ? (
            <ErrorState onRetry={() => void messages.refetch()} title="会话加载失败" />
          ) : loadingConversation ? (
            <MessageSkeleton />
          ) : !bubbles.length ? (
            <EmptyState title="从资料中开始提问" description="选择资料范围，输入问题，答案会附带可定位的原文引用。" />
          ) : (
            <div className="message-list">{bubbles.map((message) => <MessageBubble key={message.id} message={message} />)}</div>
          )}
          {errorText ? <div className="chat-error" role="alert"><span>{errorText}</span><Button onClick={() => void sendMessage(undefined, lastPrompt || lastQuestion, 'retry')} variant="secondary"><RefreshCw size={14} />重试</Button></div> : null}
          {draftStatus === 'interrupted' ? <div className="chat-interrupted" role="status">回答已停止，已保留当前内容。<Button onClick={() => void sendMessage(undefined, lastPrompt, 'continue')} variant="ghost">继续生成</Button></div> : null}
        </div>
        <div className="chat-composer-wrap">
          <div className="prompt-chips">{promptChips.map((prompt) => <button key={prompt} onClick={() => insertPrompt(prompt)} type="button">{prompt}</button>)}</div>
          <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}>
            <textarea
              aria-label="输入问题"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // Enter 发送、Shift+Enter 换行；输入法组合中的回车是在选词，不能当发送
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                if (busy || !input.trim()) return;
                event.preventDefault();
                void sendMessage();
              }}
              placeholder="询问你的资料…"
              ref={composerRef}
              rows={2}
              value={input}
            />
            {busy ? <Button aria-label="停止生成" onClick={() => { sse.abort(); dispatch({ type: 'interrupted' }); }} type="button" variant="secondary"><Pause size={17} /></Button> : <Button aria-label="发送问题" disabled={!input.trim() || create.isPending} type="submit"><Send size={17} /></Button>}
          </form>
          <p className="chat-composer-hint">回答由资料范围生成，请核对引用原文。</p>
        </div>
      </main>
      <Drawer onOpenChange={setHistoryOpen} open={historyOpen} side="bottom" title="会话历史">{historyPanel}</Drawer>
    </section>
  );
}
