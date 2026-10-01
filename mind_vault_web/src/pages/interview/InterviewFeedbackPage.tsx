import { ArrowLeft, CheckCircle2, FileText, Lightbulb } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInterviewSession } from '../../api/interview';
import { LoadingState, StatusBadge } from '../../components/ui';
import type { InterviewEvaluation } from '../../api/interview';

const dimensions = [['accuracy', '准确性'], ['depth', '深度'], ['structure', '结构'], ['clarity', '表达'], ['evidence', '证据引用']];

export function InterviewFeedbackPage() {
  const { sessionId = '' } = useParams();
  const query = useQuery({ queryKey: ['interview', 'session', sessionId, 'feedback'], queryFn: () => getInterviewSession(sessionId), enabled: Boolean(sessionId) });
  if (query.isPending) return <LoadingState label="生成反馈" />;
  if (query.isError || !query.data) return <section className="page-section"><p className="form-error">反馈加载失败。</p></section>;
  const turns = query.data.turns ?? [];
  const last = turns.at(-1);
  const evaluation = last?.evaluation as Partial<InterviewEvaluation> | undefined;
  const scoredDimensions = ['accuracy', 'depth', 'structure', 'clarity'] as const;
  const score = evaluation
    ? Math.round(scoredDimensions.reduce((total, key) => total + (evaluation[key] ?? 0), 0) / scoredDimensions.length)
    : null;
  const citations = last?.citationIds?.length ?? 0;
  const strengths = evaluation?.strengths?.filter(Boolean) ?? [];
  const gaps = evaluation?.gaps?.filter(Boolean) ?? [];
  return <section className="page-section feedback-page"><Link className="back-link" to="/app/interview"><ArrowLeft size={16} />返回训练首页</Link><header className="page-heading"><div><p className="eyebrow">训练反馈</p><h1>{query.data.title || '面试训练反馈'}</h1><p className="muted">{turns.length} 个回答已完成，以下是本轮重点反馈。</p></div><StatusBadge tone="success">{query.data.status === 'completed' ? '已完成' : '已结束'}</StatusBadge></header><section className="feedback-score-panel"><div><span>综合表现</span><strong>{score ?? '--'}</strong><small>四项评分平均值</small></div><div className="dimension-grid">{dimensions.map(([key, label]) => { const value = key === 'evidence' ? (citations ? Math.min(100, citations * 25) : 0) : evaluation?.[key as keyof InterviewEvaluation]; const display = key === 'evidence' ? (citations ? `${citations} 条` : '--') : typeof value === 'number' ? `${value}/100` : '--'; return <div key={key}><span>{label}</span><strong>{display}</strong><progress max="100" value={typeof value === 'number' ? value : 0} /></div>; })}</div></section><div className="feedback-grid"><section className="workspace-panel"><div className="section-heading"><h2><CheckCircle2 size={18} />回答与引用</h2></div>{turns.length ? turns.map((turn) => <article className="feedback-turn" key={turn.id}><h3>{turn.question}</h3><p>{turn.answer}</p><div className="citation-strip"><FileText size={15} />{turn.citationIds?.length ? `引用 ${turn.citationIds.length} 条资料证据` : '本题没有识别到资料引用'}</div></article>) : <p className="widget-empty">本轮还没有已提交回答。</p>}</section><section className="workspace-panel"><h2><Lightbulb size={18} />下一步建议</h2><ul className="feedback-list"><li>{strengths[0] || '保持先结论后依据的表达结构。'}</li><li>{gaps[0] ? `待补强：${gaps[0]}` : '在回答中补充可验证的数据和引用。'}</li><li>前往复习区巩固本轮标记的薄弱点。</li></ul><Link className="button button--secondary" to="/app/interview/review-items">查看待复习</Link></section></div></section>;
}
