import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { useState } from 'react';
import { Button, Input, LoadingState, StatusBadge } from '../../components/ui';
import { getReviewItem, listReviewItems, submitReviewAnswer, updateReviewItem, type ReviewItemDetailResponse } from '../../api/interview';
import { ReviewItemsPanel } from '../../features/interview/review-items/ReviewItemsPanel';

export function ReviewItemsPage() {
  const { itemId } = useParams();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ['interview', 'review-items'], queryFn: () => listReviewItems({ page: 1, pageSize: 50 }) });
  const detail = useQuery({ queryKey: ['interview', 'review-item', itemId], queryFn: () => getReviewItem(itemId!), enabled: Boolean(itemId) });
  const [answer, setAnswer] = useState('');
  if (itemId) return <ReviewDetail detail={detail.data} loading={detail.isPending} answer={answer} setAnswer={setAnswer} onSubmitted={() => { void client.invalidateQueries({ queryKey: ['interview', 'review-items'] }); void detail.refetch(); }} />;
  return <section className="page-section review-page"><header className="page-heading"><div><p className="eyebrow">复习中心</p><h1>把薄弱点练成优势</h1><p className="muted">回顾训练中暴露的概念，重新组织答案并标记掌握。</p></div><StatusBadge>{list.data?.total ?? 0} 项</StatusBadge></header><section className="workspace-panel"><ReviewItemsPanel items={list.data?.items ?? []} loading={list.isPending} onMaster={(item) => void updateReviewItem(item.id, 'COMPLETED').then(() => client.invalidateQueries({ queryKey: ['interview', 'review-items'] }))} /></section></section>;
}

function ReviewDetail({ detail, loading, answer, setAnswer, onSubmitted }: { detail?: ReviewItemDetailResponse; loading: boolean; answer: string; setAnswer: (value: string) => void; onSubmitted: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  async function submit() { if (!detail || !answer.trim()) return; setSubmitting(true); await submitReviewAnswer(detail.item.id, answer.trim()); setSubmitting(false); setAnswer(''); onSubmitted(); }
  if (loading) return <LoadingState label="加载复习项" />;
  if (!detail) return <section className="page-section"><p className="form-error">复习项不存在。</p></section>;
  return <section className="page-section review-detail-page"><button className="back-link" onClick={() => window.history.back()} type="button"><ArrowLeft size={16} />返回复习列表</button><header className="page-heading"><div><p className="eyebrow">复习项</p><h1>{detail.item.title || detail.item.prompt}</h1></div><StatusBadge tone={detail.item.status === 'COMPLETED' ? 'success' : 'warning'}>{detail.item.status === 'COMPLETED' ? '已掌握' : '待复习'}</StatusBadge></header><div className="review-detail-grid"><section className="workspace-panel"><h2>原问题</h2><p className="question-copy">{detail.sourceTurn?.question || detail.item.prompt}</p><h2>原回答</h2><p className="answer-copy">{detail.sourceTurn?.answer || '暂无原回答'}</p>{detail.item.reason ? <p className="review-reason">薄弱点：{detail.item.reason}</p> : null}</section><section className="workspace-panel"><h2>重新回答</h2><textarea aria-label="复习回答" onChange={(event) => setAnswer(event.target.value)} placeholder="用自己的话重新回答这个问题…" rows={8} value={answer} /><Button disabled={!answer.trim() || submitting} onClick={() => void submit()}><Send size={16} />提交复习答案</Button><Button onClick={() => void updateReviewItem(detail.item.id, 'COMPLETED').then(onSubmitted)} variant="ghost"><Check size={16} />标记已掌握</Button></section></div><Input aria-hidden="true" className="sr-only" tabIndex={-1} /></section>;
}
