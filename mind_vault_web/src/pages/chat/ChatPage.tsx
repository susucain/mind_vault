import { useEffect, useReducer, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ChevronsUpDown, Copy, FileText, Layers, Menu, MessageSquarePlus, Pause, RefreshCw, Search, Send, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createConversation, createMessageStreamRequest, getConversation, listConversations, listMessages, updateConversation } from '../../api/conversations';
import { listDatasets } from '../../api/datasets';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/shadcn/ui/popover';
import { Button, Drawer, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { CitationCard, MarkdownViewer, chatReducer, initialChatState } from '../../features/chat';
import { useSse, type StreamEvent } from '../../hooks/use-sse';
import type { ChatMessage, Citation, Conversation, Dataset } from '../../types/domain';

const PAGE_SIZE = 20;
const prompts = ['总结这组资料的关键结论', '对比不同方案的优缺点', '给我一个可执行的复习计划'];

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
    </section>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down'>();
  return (
    <article className={`message-bubble message-bubble--${message.role}`}>
      <div className="message-bubble__avatar">{message.role === 'user' ? '我' : <Bot size={17} />}</div>
      <div className="message-bubble__body">
        {message.role === 'user' ? null : <span className="message-bubble__role">Mind Vault</span>}
        {message.role === 'user' ? <p>{message.content}</p> : <><MarkdownViewer content={message.content} /><MessageCitations citations={message.citations} /></>}
        <div className="message-actions">
          <button aria-label="复制回答" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopied(true); }} type="button"><Copy size={14} />{copied ? '已复制' : '复制'}</button>
          {message.role === 'assistant' ? <><button aria-label="回答有帮助" className={feedback === 'up' ? 'is-selected' : ''} onClick={() => setFeedback('up')} type="button"><ThumbsUp size={14} /></button><button aria-label="回答没帮助" className={feedback === 'down' ? 'is-selected' : ''} onClick={() => setFeedback('down')} type="button"><ThumbsDown size={14} /></button></> : null}
        </div>
      </div>
    </article>
  );
}

function AssistantMessage({ draft }: { draft: NonNullable<ReturnType<typeof initialChatState>['draft']> }) {
  return (
    <article className="message-bubble message-bubble--assistant">
      <div className="message-bubble__avatar"><Bot size={17} /></div>
      <div className="message-bubble__body">
        <span className="message-bubble__role">Mind Vault {draft.status === 'streaming' ? <StatusBadge tone="warning">{draft.backendStage || '生成中'}</StatusBadge> : null}</span>
        <MarkdownViewer content={draft.content} isAnimating={draft.status === 'streaming'} />
        <MessageCitations citations={draft.citations} />
        {draft.error ? <p className="form-error">{draft.error}</p> : null}
        <div className="message-actions"><button aria-label="复制回答" onClick={() => void navigator.clipboard?.writeText(draft.content)} type="button"><Copy size={14} />复制</button><button aria-label="回答有帮助" type="button"><ThumbsUp size={14} /></button><button aria-label="回答没帮助" type="button"><ThumbsDown size={14} /></button></div>
      </div>
    </article>
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
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [favoriteError, setFavoriteError] = useState<string>();
  const [lastPrompt, setLastPrompt] = useState('');
  const sse = useSse();

  const conversationId = routeId ?? (isNew ? undefined : createdConversationId);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);

  const conversations = useInfiniteQuery({
    queryKey: ['chat', 'conversations', debouncedSearch],
    queryFn: ({ pageParam }) => listConversations({ q: debouncedSearch || undefined, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.page + 1 : undefined),
  });
  const conversationItems = conversations.data?.pages.flatMap((page) => page.items) ?? [];

  const conversation = useQuery({ enabled: Boolean(conversationId), queryKey: ['chat', 'conversation', conversationId], queryFn: () => getConversation(conversationId!) });
  const messages = useQuery({ enabled: Boolean(conversationId), queryKey: ['chat', 'messages', conversationId], queryFn: () => listMessages(conversationId!) });
  const datasets = useQuery({ queryKey: ['chat', 'datasets'], queryFn: () => listDatasets({ pageSize: 50 }) });
  const create = useMutation({ mutationFn: createConversation });
  const updateScope = useMutation({
    mutationFn: (ids: string[]) => updateConversation(conversationId!, { datasetIds: ids }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', conversationId] });
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
  const statusRef = useRef(state.status);
  // 通过 effect 同步 ref，供下方「切换会话」逻辑判断当前是否正在生成。
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  // 切换会话时清空本地消息；流式过程中（新建会话会切换到具体 id）不清空，避免打断回答
  useEffect(() => {
    if (statusRef.current === 'loading' || statusRef.current === 'streaming') return;
    dispatch({ type: 'history', messages: [] });
  }, [conversationId]);

  useEffect(() => {
    if (!messages.data || state.status === 'loading' || state.status === 'streaming' || state.status === 'interrupted') return;
    if (createdConversationId && !messages.data.length) return;
    dispatch({ type: 'history', messages: messages.data });
  }, [createdConversationId, messages.data, state.status]);

  // 用服务端返回的资料集范围初始化可编辑状态（会话切换/首次加载时）。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDatasets(activeConversation ? [...activeConversation.datasetIds] : []);
  }, [activeConversation]);

  const busy = state.status === 'loading' || state.status === 'streaming';
  const lastQuestion = [...state.messages].reverse().find((message) => message.role === 'user')?.content;
  const datasetItems = datasets.data?.items ?? [];
  const isFavorite = activeConversation?.favorite ?? false;

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
        navigate(`/app/chat/${id}`, { replace: true });
        void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      }
      if (mode === 'continue') {
        dispatch({ type: 'resume' });
      } else if (mode === 'new' || !conversationId) {
        const user: ChatMessage = { id: `local-${Date.now()}`, conversationId: id, role: 'user', content: question, citations: [], createdAt: new Date().toISOString() };
        dispatch({ type: 'begin', conversationId: id, user });
      }
      setInput('');
      const request = createMessageStreamRequest(id, question);
      await sse.start(request.path, { init: request.init, onEvent: (streamEvent: StreamEvent) => dispatch({ type: 'event', event: streamEvent }) });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', id] });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', id] });
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
    dispatch({ type: 'history', messages: [] });
    setInput('');
    setLastPrompt('');
    setSelectedDatasets([]);
    navigate('/app/chat/new');
  }

  function applyScope(ids: string[]) {
    setSelectedDatasets(ids);
    if (conversationId) updateScope.mutate(ids);
  }

  if (!isNew && messages.isPending) return <LoadingState label="加载会话" />;
  if (!isNew && messages.isError) return <ErrorState onRetry={() => void messages.refetch()} title="会话加载失败" />;

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
            <div><p className="eyebrow">Mind Vault / 问答</p><h1>{activeConversation?.title || '新对话'}</h1></div>
          </div>
          <div className="chat-header__actions">
            <button aria-label="开启新对话" className="icon-button chat-mobile-only" onClick={startNewConversation} type="button"><MessageSquarePlus size={18} /></button>
            <ScopePicker applying={updateScope.isPending} datasets={datasetItems} onChange={applyScope} value={selectedDatasets} />
            <button aria-label={isFavorite ? '取消收藏' : '收藏会话'} className={`icon-button${isFavorite ? ' is-selected' : ''}`} disabled={!activeConversation || updateFavorite.isPending} onClick={() => updateFavorite.mutate(!isFavorite)} type="button"><Star fill={isFavorite ? 'currentColor' : 'none'} size={17} /></button>
          </div>
        </header>
        <div className="chat-scroll">
          {favoriteError ? <div className="chat-error" role="alert"><span>{favoriteError}</span></div> : null}
          {!state.messages.length && !state.draft ? <EmptyState title="从资料中开始提问" description="选择资料范围，输入问题，答案会附带可定位的原文引用。" /> : <div className="message-list">{state.messages.map((message) => <MessageBubble key={message.id} message={message} />)}{state.draft ? <AssistantMessage draft={state.draft} /> : null}</div>}
          {state.status === 'error' ? <div className="chat-error" role="alert"><span>{state.error || '回答失败'}</span><Button onClick={() => void sendMessage(undefined, lastPrompt || lastQuestion, 'retry')} variant="secondary"><RefreshCw size={14} />重试</Button></div> : null}
          {state.status === 'interrupted' ? <div className="chat-interrupted" role="status">回答已停止，已保留当前内容。<Button onClick={() => void sendMessage(undefined, lastPrompt, 'continue')} variant="ghost">继续生成</Button></div> : null}
        </div>
        <div className="chat-composer-wrap">
          <div className="prompt-chips">{prompts.map((prompt) => <button key={prompt} onClick={() => setInput(prompt)} type="button">{prompt}</button>)}</div>
          <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}>
            <textarea aria-label="输入问题" onChange={(event) => setInput(event.target.value)} placeholder="询问你的资料…" rows={2} value={input} />
            {busy ? <Button aria-label="停止生成" onClick={() => { sse.abort(); dispatch({ type: 'interrupted' }); }} type="button" variant="secondary"><Pause size={17} /></Button> : <Button aria-label="发送问题" disabled={!input.trim() || create.isPending} type="submit"><Send size={17} /></Button>}
          </form>
          <p className="chat-composer-hint">回答由资料范围生成，请核对引用原文。</p>
        </div>
      </main>
      <Drawer onOpenChange={setHistoryOpen} open={historyOpen} side="bottom" title="会话历史">{historyPanel}</Drawer>
    </section>
  );
}
