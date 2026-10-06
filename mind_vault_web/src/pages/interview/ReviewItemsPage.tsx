import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { useState } from 'react';
import { Button, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { getReviewItem, listReviewItems, submitReviewAnswer, updateReviewItem, type ReviewItemDetailResponse, type ReviewItemRecord } from '../../api/interview';
import { ReviewItemsPanel } from '../../features/interview/review-items/ReviewItemsPanel';
import type { ReviewFilter } from '../../features/interview/review-items/review-items';

export function ReviewItemsPage() {
  const { itemId } = useParams();
  const client = useQueryClient();
  const [status, setStatus] = useState<ReviewFilter>('PENDING');
  const list = useQuery({
    queryKey: ['interview', 'review-items', status],
    queryFn: () => listReviewItems({ status, page: 1, pageSize: 50 }),
  });
  const detail = useQuery({ queryKey: ['interview', 'review-item', itemId], queryFn: () => getReviewItem(itemId!), enabled: Boolean(itemId) });
  const [answer, setAnswer] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [undoItem, setUndoItem] = useState<ReviewItemRecord | null>(null);
  async function master(item: ReviewItemRecord) {
    setNotice(null);
    setUndoItem(null);
    try {
      await updateReviewItem(item.id, 'COMPLETED');
      setUndoItem(item);
      setNotice({ tone: 'ok', text: `已把「${item.title || '复习项'}」标记为已掌握。` });
      await client.invalidateQueries({ queryKey: ['interview', 'review-items'] });
    } catch (caught) {
      setNotice({ tone: 'error', text: caught instanceof Error ? caught.message : '标记失败，请重试' });
    }
  }
  async function undo() {
    if (!undoItem) return;
    try {
      await updateReviewItem(undoItem.id, 'PENDING');
      setNotice({ tone: 'ok', text: `已撤销「${undoItem.title || '复习项'}」的掌握标记。` });
      setUndoItem(null);
      await client.invalidateQueries({ queryKey: ['interview', 'review-items'] });
    } catch (caught) {
      setNotice({ tone: 'error', text: caught instanceof Error ? caught.message : '撤销失败，请重试' });
    }
  }
  if (itemId) return <ReviewDetail detail={detail.data} error={detail.isError} loading={detail.isPending} onRetry={() => void detail.refetch()} answer={answer} setAnswer={setAnswer} onSubmitted={() => { void client.invalidateQueries({ queryKey: ['interview', 'review-items'] }); void detail.refetch(); }} />;
  return <section className="page-section review-page"><header className="page-heading"><div><p className="eyebrow">复习中心</p><h1>把薄弱点练成优势</h1><p className="muted">回顾训练中暴露的概念，重新组织答案并标记掌握。</p></div><StatusBadge>{list.data?.total ?? 0} 项</StatusBadge></header><section className="workspace-panel">{notice ? <div className={`notice-bar ${notice.tone === 'ok' ? 'review-result review-result--ok' : 'form-error'}`} role="status"><span>{notice.text}</span>{undoItem && notice.tone === 'ok' ? <Button className="button--sm" onClick={() => void undo()} variant="ghost">撤销</Button> : null}</div> : null}{list.isError ? <ErrorState onRetry={() => void list.refetch()} title="复习项列表加载失败，请重试" /> : <ReviewItemsPanel items={list.data?.items ?? []} loading={list.isPending} status={status} onStatusChange={setStatus} onMaster={(item) => void master(item)} />}</section></section>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ReviewDetail({ detail, error, loading, onRetry, answer, setAnswer, onSubmitted }: { detail?: ReviewItemDetailResponse; error: boolean; loading: boolean; onRetry: () => void; answer: string; setAnswer: (value: string) => void; onSubmitted: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [mastering, setMastering] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [masterError, setMasterError] = useState('');
  const [result, setResult] = useState<{ score: number; autoCompleted: boolean } | null>(null);
  async function submit() {
    if (!detail || !answer.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await submitReviewAnswer(detail.item.id, answer.trim());
      setResult({ score: response.score, autoCompleted: response.autoCompleted });
      setAnswer('');
      onSubmitted();
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }
  async function master() {
    if (!detail) return;
    setMastering(true);
    setMasterError('');
    try {
      await updateReviewItem(detail.item.id, 'COMPLETED');
      onSubmitted();
    } catch (caught) {
      setMasterError(caught instanceof Error ? caught.message : '标记失败，请重试');
    } finally {
      setMastering(false);
    }
  }
  if (loading) return <LoadingState label="加载复习项" />;
  if (error) return <section className="page-section"><ErrorState onRetry={onRetry} title="复习项加载失败，请重试" /></section>;
  if (!detail) return <section className="page-section"><p className="form-error">复习项不存在。</p></section>;
  const attempts = [...detail.attempts].reverse();
  return <section className="page-section review-detail-page"><button className="back-link" onClick={() => window.history.back()} type="button"><ArrowLeft size={16} />返回复习列表</button><header className="page-heading"><div><p className="eyebrow">复习项</p><h1>{detail.item.title || '未命名复习项'}</h1></div><StatusBadge tone={detail.item.status === 'COMPLETED' ? 'success' : 'warning'}>{detail.item.status === 'COMPLETED' ? '已掌握' : '待复习'}</StatusBadge></header><div className="review-detail-grid"><section className="workspace-panel"><h2>原问题</h2><p className="question-copy">{detail.sourceTurn?.question || '暂无原问题'}</p><h2>原回答</h2><p className="answer-copy">{detail.sourceTurn?.answer || '暂无原回答'}</p>{detail.item.reason ? <p className="review-reason">薄弱点：{detail.item.reason}</p> : null}</section><section className="workspace-panel"><h2>重新回答</h2><textarea aria-label="复习回答" onChange={(event) => setAnswer(event.target.value)} placeholder="用自己的话重新回答这个问题…" rows={8} value={answer} /><Button disabled={!answer.trim() || submitting} onClick={() => void submit()}><Send size={16} />提交复习答案</Button>{submitError ? <p className="form-error" role="alert">{submitError}</p> : null}{result ? <p className={result.autoCompleted ? 'review-result review-result--ok' : 'review-result'} role="status">{result.autoCompleted ? `本次 ${result.score} 分，已达 60 分，已自动标记为已掌握。` : `本次 ${result.score} 分，未达 60 分，仍保留在待复习。`}</p> : null}<Button disabled={mastering} onClick={() => void master()} variant="ghost"><Check size={16} />标记已掌握</Button>{masterError ? <p className="form-error" role="alert">{masterError}</p> : null}</section></div>{attempts.length ? <section className="workspace-panel"><h2>重答记录</h2><ul className="review-attempts">{attempts.map((attempt) => <li key={attempt.id}><span>{formatTime(attempt.createdAt)}</span><strong>{Math.round(Number(attempt.score))} 分</strong></li>)}</ul></section> : null}</section>;
}
