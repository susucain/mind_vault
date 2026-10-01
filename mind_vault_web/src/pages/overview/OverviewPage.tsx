import { ArrowRight, Eye, FileText, MessageSquareText, Plus, RotateCcw, Send, Sparkles, type LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, LoadingState, StatusBadge, Tooltip } from '../../components/ui';
import { documentStatusLabel, documentTone, fileType, formatDate, formatFileSize } from '../../features/documents/document-utils';
import { useContinueInterview, useConversations, useDocumentCount, usePendingReviewItems, useRecentDocuments } from '../../features/overview/queries';
import { useAuthStore } from '../../stores/auth.store';

const prompts = ['总结最近上传的资料', '比较两份方案的差异', '从资料中生成面试题', '找出项目风险点'];

function WidgetError({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div className="widget-state" role="alert">
      <span>{label}</span>
      <button aria-label={`重试${label}`} className="icon-button" onClick={retry} type="button"><RotateCcw size={16} /></button>
    </div>
  );
}

function StatItem({
  Icon,
  error,
  label,
  loading,
  retry,
  value,
}: {
  Icon: LucideIcon;
  error: boolean;
  label: string;
  loading: boolean;
  retry: () => void;
  value?: number;
}) {
  return (
    <article className="stat-item">
      <Icon aria-hidden="true" size={19} />
      {loading ? <LoadingState label={`加载${label}`} /> : error ? (
        <WidgetError label={`${label === '问答会话' ? '会话统计' : label}加载失败`} retry={retry} />
      ) : <div><strong>{value ?? 0}</strong><span>{label}</span></div>}
    </article>
  );
}

export function OverviewPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const recent = useRecentDocuments();
  const documentCount = useDocumentCount();
  const conversations = useConversations();
  const interview = useContinueInterview();
  const reviews = usePendingReviewItems();

  function ask(question: string) {
    void navigate(`/app/chat/new?prompt=${encodeURIComponent(question)}`);
  }

  return (
    <section className="overview-page page-section">
      <header className="page-heading">
        <div>
          <p className="eyebrow">概览</p>
          <h1>你好，{user?.nickname || '今天想整理什么？'}</h1>
        </div>
        <Button onClick={() => void navigate('/app/library?upload=1')}><Plus size={17} />上传文件</Button>
      </header>

      <section className="ask-panel" aria-labelledby="ask-title">
        <div className="ask-panel__title"><Sparkles size={19} /><h2 id="ask-title">向你的资料提问</h2></div>
        <form className="ask-box" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const question = String(data.get('question') ?? '').trim();
          if (question) ask(question);
        }}>
          <textarea aria-label="向资料提问" name="question" placeholder="输入问题，答案会附带原文引用…" rows={3} />
          <Button aria-label="发送问题" type="submit"><Send size={17} /></Button>
        </form>
        <div className="prompt-chips">
          {prompts.map((prompt) => <button key={prompt} onClick={() => ask(prompt)} type="button">{prompt}</button>)}
        </div>
      </section>

      <section aria-label="工作台统计" className="stats-grid">
        <StatItem Icon={FileText} error={documentCount.isError} label="资料文件" loading={documentCount.isPending} retry={() => void documentCount.refetch()} value={documentCount.data} />
        <StatItem Icon={MessageSquareText} error={conversations.isError} label="问答会话" loading={conversations.isPending} retry={() => void conversations.refetch()} value={conversations.data?.length} />
        <StatItem Icon={RotateCcw} error={reviews.isError} label="待复习" loading={reviews.isPending} retry={() => void reviews.refetch()} value={reviews.data?.total} />
      </section>

      <div className="overview-grid">
        <section className="workspace-panel recent-panel">
          <div className="section-heading"><h2>最近资料</h2><Link to="/app/library">查看全部<ArrowRight size={15} /></Link></div>
          {recent.isPending ? <LoadingState label="加载最近文件" /> : recent.isError ? (
            <WidgetError label="最近文件加载失败" retry={() => void recent.refetch()} />
          ) : recent.data.items.length === 0 ? <p className="widget-empty">上传第一份资料开始使用。</p> : (
            <ul className="file-list">
              {recent.data.items.map((document) => (
                <li key={document.id}>
                  <FileText aria-hidden="true" size={18} />
                  <div className="recent-document-copy">
                    <Link to={`/app/library/documents/${document.id}`}>{document.title}</Link>
                    <span>{fileType(document).toUpperCase()} · {formatFileSize(document.sourceFileSize)} · {formatDate(document.createdAt)}</span>
                  </div>
                  <StatusBadge tone={documentTone(document)}>{documentStatusLabel(document)}</StatusBadge>
                  <div className="recent-document-actions">
                    <Tooltip content="查看详情"><Link aria-label={`查看 ${document.title}`} className="icon-button" to={`/app/library/documents/${document.id}`}><FileText size={16} /></Link></Tooltip>
                    <Tooltip content="预览原文"><Link aria-label={`预览 ${document.title}`} className="icon-button" to={`/app/library/documents/${document.id}/preview`}><Eye size={16} /></Link></Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="overview-side">
          <section className="workspace-panel">
            <div className="section-heading"><h2>继续面试</h2><Link to="/app/interview">全部</Link></div>
            {interview.isPending ? <LoadingState label="加载面试" /> : interview.isError ? (
              <WidgetError label="面试加载失败" retry={() => void interview.refetch()} />
            ) : interview.data[0] ? (
              <Link className="continue-item" to={`/app/interview/sessions/${interview.data[0].id}`}>
                <strong>{interview.data[0].title || '进行中的面试'}</strong>
                <span>已完成 {interview.data[0].answeredCount ?? interview.data[0].currentIndex ?? 0}/{interview.data[0].questionCount ?? interview.data[0].totalQuestions ?? 0} 题</span>
                <progress
                  aria-label={`${interview.data[0].title || '进行中的面试'}进度`}
                  max="100"
                  value={Math.round(((interview.data[0].answeredCount ?? interview.data[0].currentIndex ?? 0) / Math.max(1, interview.data[0].questionCount ?? interview.data[0].totalQuestions ?? 0)) * 100)}
                />
              </Link>
            ) : <p className="widget-empty">暂无进行中的面试。</p>}
          </section>
          <section className="workspace-panel">
            <div className="section-heading"><h2>待复习</h2><Link to="/app/interview/review-items">全部</Link></div>
            {reviews.isPending ? <LoadingState label="加载复习项" /> : reviews.isError ? (
              <WidgetError label="复习项加载失败" retry={() => void reviews.refetch()} />
            ) : reviews.data.items.length ? (
              <ul className="review-list">{reviews.data.items.slice(0, 3).map((item) => <li key={item.id}>{item.title || '待复习问题'}</li>)}</ul>
            ) : <p className="widget-empty">今天没有待复习内容。</p>}
          </section>
        </div>
      </div>
    </section>
  );
}
