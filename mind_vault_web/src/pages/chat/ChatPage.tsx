import { useEffect, useReducer, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Copy, FileText, Menu, Pause, Plus, RefreshCw, Send, SlidersHorizontal, Star, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createConversation, createMessageStreamRequest, listConversations, listMessages, updateConversation } from '../../api/conversations';
import { listDatasets } from '../../api/datasets';
import { Button, Drawer, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { CitationCard, MarkdownViewer, chatReducer, initialChatState } from '../../features/chat';
import { useSse, type StreamEvent } from '../../hooks/use-sse';
import type { ChatMessage, Conversation } from '../../types/domain';

const prompts = ['总结这组资料的关键结论', '对比不同方案的优缺点', '给我一个可执行的复习计划'];

function formatDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(date));
}

function ConversationList({ items, activeId, onSelect }: { items: Conversation[]; activeId?: string; onSelect: (id: string) => void }) {
  return <div className="chat-history-list">{items.map((item) => <button className={`chat-history-item${item.id === activeId ? ' is-active' : ''}`} key={item.id} onClick={() => onSelect(item.id)} type="button"><span>{item.title || '新对话'}</span><time>{formatDate(item.updatedAt)}</time></button>)}</div>;
}

export function ChatPage({ isNew = false }: { isNew?: boolean }) {
  const { conversationId: routeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createdConversationId, setCreatedConversationId] = useState<string>();
  const [state, dispatch] = useReducer(chatReducer, initialChatState());
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [favorite, setFavorite] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const sse = useSse();
  const conversations = useQuery({ queryKey: ['chat', 'conversations'], queryFn: listConversations });
  const conversationId = routeId ?? createdConversationId;
  const messages = useQuery({ enabled: Boolean(conversationId), queryKey: ['chat', 'messages', conversationId], queryFn: () => listMessages(conversationId!) });
  const datasets = useQuery({ queryKey: ['chat', 'datasets'], queryFn: () => listDatasets({ pageSize: 50 }) });
  const create = useMutation({ mutationFn: createConversation });
  const updateScope = useMutation({ mutationFn: (ids: string[]) => updateConversation(conversationId!, ids), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] }); setScopeOpen(false); } });

  useEffect(() => {
    if (!messages.data || state.status === 'loading' || state.status === 'streaming' || state.status === 'interrupted') return;
    if (createdConversationId && !messages.data.length) return;
    dispatch({ type: 'history', messages: messages.data });
  }, [createdConversationId, messages.data, state.status]);

  const activeConversation = conversations.data?.find((item) => item.id === conversationId);
  const scopeIds = selectedDatasets.length ? selectedDatasets : activeConversation?.datasetIds ?? [];
  const citations = state.draft?.citations ?? state.messages.flatMap((message) => message.citations);
  const lastQuestion = [...state.messages].reverse().find((message) => message.role === 'user')?.content;
  const busy = state.status === 'loading' || state.status === 'streaming';

  async function sendMessage(event?: FormEvent, content = input, mode: 'new' | 'retry' | 'continue' = 'new') {
    event?.preventDefault();
    const question = (mode === 'continue' ? lastPrompt : content).trim();
    if (!question || busy) return;
    if (mode !== 'continue') setLastPrompt(question);
    let id = conversationId;
    try {
      if (!id) {
        const created = await create.mutateAsync({ datasetIds: selectedDatasets.length ? selectedDatasets : datasets.data?.items.slice(0, 1).map((item) => item.id) ?? [], title: question.slice(0, 28) });
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
    } catch (error) {
      dispatch({ type: 'failed', message: error instanceof Error ? error.message : '回答失败' });
    }
  }

  function selectConversation(id: string) {
    setHistoryOpen(false);
    navigate(`/app/chat/${id}`);
  }

  if (!isNew && messages.isPending) return <LoadingState label="加载会话" />;
  if (!isNew && messages.isError) return <ErrorState onRetry={() => void messages.refetch()} title="会话加载失败" />;

  return (
    <section className="chat-page">
      <header className="chat-header">
        <div className="chat-header__title"><button aria-label="打开会话历史" className="icon-button chat-mobile-only" onClick={() => setHistoryOpen(true)} type="button"><Menu size={19} /></button><div><p className="eyebrow">Mind Vault / 问答</p><h1>{activeConversation?.title || '新对话'}</h1></div></div>
        <div className="chat-header__actions"><button aria-label={favorite ? '取消收藏' : '收藏会话'} className={`icon-button${favorite ? ' is-selected' : ''}`} onClick={() => setFavorite((value) => !value)} type="button"><Star fill={favorite ? 'currentColor' : 'none'} size={17} /></button><button aria-label="打开资料范围" className="icon-button" onClick={() => setScopeOpen(true)} type="button"><SlidersHorizontal size={17} /></button><Button onClick={() => navigate('/app/chat/new')} variant="secondary"><Plus size={16} />新对话</Button></div>
      </header>
      <div className="chat-workspace">
        <aside aria-label="会话历史" className="chat-history"><div className="chat-panel-heading"><h2>会话历史</h2><button aria-label="新建对话" className="icon-button" onClick={() => navigate('/app/chat/new')} type="button"><Plus size={17} /></button></div>{conversations.isPending ? <LoadingState label="加载会话" /> : conversations.isError ? <ErrorState onRetry={() => void conversations.refetch()} title="历史加载失败" /> : conversations.data?.length ? <ConversationList activeId={conversationId} items={conversations.data} onSelect={selectConversation} /> : <p className="chat-muted">还没有会话</p>}</aside>
        <main className="chat-main">
          <div className="chat-scroll">{!state.messages.length && !state.draft ? <EmptyState title="从资料中开始提问" description="选择资料范围，输入问题，答案会附带可定位的原文引用。" /> : <div className="message-list">{state.messages.map((message) => <MessageBubble key={message.id} message={message} />)}{state.draft ? <AssistantMessage draft={state.draft} /> : null}</div>}{state.status === 'error' ? <div className="chat-error" role="alert"><span>{state.error || '回答失败'}</span><Button onClick={() => void sendMessage(undefined, lastPrompt || lastQuestion, 'retry')} variant="secondary"><RefreshCw size={14} />重试</Button></div> : null}{state.status === 'interrupted' ? <div className="chat-interrupted" role="status">回答已停止，已保留当前内容。<Button onClick={() => void sendMessage(undefined, lastPrompt, 'continue')} variant="ghost">继续生成</Button></div> : null}</div>
          <div className="chat-composer-wrap"><div className="prompt-chips">{prompts.map((prompt) => <button key={prompt} onClick={() => setInput(prompt)} type="button">{prompt}</button>)}</div><form className="chat-composer" onSubmit={(event) => void sendMessage(event)}><textarea aria-label="输入问题" onChange={(event) => setInput(event.target.value)} placeholder="询问你的资料…" rows={2} value={input} />{busy ? <Button aria-label="停止生成" onClick={() => { sse.abort(); dispatch({ type: 'interrupted' }); }} type="button" variant="secondary"><Pause size={17} /></Button> : <Button aria-label="发送问题" disabled={!input.trim() || create.isPending} type="submit"><Send size={17} /></Button>}</form><p className="chat-composer-hint">回答由资料范围生成，请核对引用原文。</p></div>
        </main>
        <aside aria-label="引用" className="chat-citations"><div className="chat-panel-heading"><h2>引用 {citations.length ? `(${citations.length})` : ''}</h2><button aria-label="关闭引用栏" className="icon-button chat-mobile-only" onClick={() => setCitationsOpen(false)} type="button"><X size={17} /></button></div>{citations.length ? citations.map((citation) => <CitationCard citation={citation} key={citation.id} />) : <div className="chat-empty-side"><FileText size={22} /><span>生成回答后显示来源</span></div>}</aside>
      </div>
      <div className="chat-mobile-actions"><Button onClick={() => setHistoryOpen(true)} variant="secondary"><Menu size={15} />历史</Button><Button onClick={() => setCitationsOpen(true)} variant="secondary"><FileText size={15} />引用 {citations.length || ''}</Button></div>
      <Drawer open={historyOpen} onOpenChange={setHistoryOpen} side="bottom" title="会话历史"><ConversationList activeId={conversationId} items={conversations.data ?? []} onSelect={selectConversation} /></Drawer>
      <Drawer open={citationsOpen} onOpenChange={setCitationsOpen} side="bottom" title={`引用 ${citations.length ? `(${citations.length})` : ''}`}>{citations.length ? citations.map((citation) => <CitationCard citation={citation} key={citation.id} />) : <p className="chat-muted">生成回答后显示来源</p>}</Drawer>
      <Drawer open={scopeOpen} onOpenChange={setScopeOpen} side="right" title="资料范围"><div className="scope-picker"><p className="muted">选择本次会话检索的资料集。</p>{datasets.data?.items.map((dataset) => <label key={dataset.id}><input checked={scopeIds.includes(dataset.id)} onChange={(event) => setSelectedDatasets((ids) => event.target.checked ? [...ids, dataset.id] : ids.filter((id) => id !== dataset.id))} type="checkbox" />{dataset.name}</label>)}<Button disabled={!scopeIds.length || updateScope.isPending || !conversationId} onClick={() => conversationId ? updateScope.mutate(scopeIds) : setScopeOpen(false)}><SlidersHorizontal size={15} />保存范围</Button></div></Drawer>
    </section>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down'>();
  return <article className={`message-bubble message-bubble--${message.role}`}><div className="message-bubble__avatar">{message.role === 'user' ? '我' : <Bot size={17} />}</div><div className="message-bubble__body"><span className="message-bubble__role">{message.role === 'user' ? '我' : 'Mind Vault'}</span>{message.role === 'user' ? <p>{message.content}</p> : <MarkdownViewer content={message.content} />}<div className="message-actions"><button aria-label="复制回答" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopied(true); }} type="button"><Copy size={14} />{copied ? '已复制' : '复制'}</button>{message.role === 'assistant' ? <><button aria-label="回答有帮助" className={feedback === 'up' ? 'is-selected' : ''} onClick={() => setFeedback('up')} type="button"><ThumbsUp size={14} /></button><button aria-label="回答没帮助" className={feedback === 'down' ? 'is-selected' : ''} onClick={() => setFeedback('down')} type="button"><ThumbsDown size={14} /></button></> : null}</div></div></article>;
}

function AssistantMessage({ draft }: { draft: NonNullable<ReturnType<typeof initialChatState>['draft']> }) {
  return <article className="message-bubble message-bubble--assistant"><div className="message-bubble__avatar"><Bot size={17} /></div><div className="message-bubble__body"><span className="message-bubble__role">Mind Vault {draft.status === 'streaming' ? <StatusBadge tone="warning">{draft.backendStage || '生成中'}</StatusBadge> : null}</span><MarkdownViewer content={draft.content} />{draft.error ? <p className="form-error">{draft.error}</p> : null}<div className="message-actions"><button aria-label="复制回答" onClick={() => void navigator.clipboard?.writeText(draft.content)} type="button"><Copy size={14} />复制</button><button aria-label="回答有帮助" type="button"><ThumbsUp size={14} /></button><button aria-label="回答没帮助" type="button"><ThumbsDown size={14} /></button></div></div></article>;
}
