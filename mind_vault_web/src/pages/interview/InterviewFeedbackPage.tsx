import { ArrowLeft, FileText, Lightbulb, ListChecks } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInterviewSession } from '../../api/interview';
import type { InterviewEvaluation, InterviewTurnResponse } from '../../api/interview';
import { ErrorState, LoadingState, StatusBadge } from '../../components/ui';

const scoredDimensions = [
  ['accuracy', '准确性'],
  ['depth', '深度'],
  ['structure', '结构'],
  ['clarity', '表达'],
] as const;

type ScoredKey = (typeof scoredDimensions)[number][0];

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 单题得分：该题四维评分的平均值。 */
function turnScore(evaluation?: Partial<InterviewEvaluation> | null): number | null {
  if (!evaluation) return null;
  const values = scoredDimensions.map(([key]) => evaluation[key]).filter(isNumber);
  if (!values.length) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

/** 维度平均分：会话内全部已评分题目该维度的均值。 */
function dimensionAverage(turns: InterviewTurnResponse[], key: ScoredKey): number | null {
  const values = turns.map((turn) => turn.evaluation?.[key]).filter(isNumber);
  if (!values.length) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

/** 综合得分：四个维度平均分的均值。多题会话聚合全部回答，而非只看最后一题。 */
function overallScore(turns: InterviewTurnResponse[]): number | null {
  const averages = scoredDimensions.map(([key]) => dimensionAverage(turns, key)).filter(isNumber);
  if (!averages.length) return null;
  return Math.round(averages.reduce((total, value) => total + value, 0) / averages.length);
}

function uniqueText(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function InterviewFeedbackPage() {
  const { sessionId = '' } = useParams();
  const query = useQuery({ queryKey: ['interview', 'session', sessionId, 'feedback'], queryFn: () => getInterviewSession(sessionId), enabled: Boolean(sessionId) });
  if (query.isPending) return <LoadingState label="生成反馈" />;
  if (query.isError || !query.data) return <section className="page-section"><ErrorState onRetry={() => void query.refetch()} title="反馈加载失败，请重试" /></section>;
  const turns = query.data.turns ?? [];
  const scoredTurns = turns.filter((turn) => turnScore(turn.evaluation) !== null);
  const overall = overallScore(turns);
  const citationTotal = turns.reduce((total, turn) => total + (turn.citationIds?.length ?? 0), 0);
  const strengths = uniqueText(turns.flatMap((turn) => turn.evaluation?.strengths ?? []));
  const gaps = uniqueText(turns.flatMap((turn) => turn.evaluation?.gaps ?? []));
  return <section className="page-section feedback-page">
    <Link className="back-link" to="/app/interview"><ArrowLeft size={16} />返回训练首页</Link>
    <header className="page-heading"><div><p className="eyebrow">训练反馈</p><h1>{query.data.title || '面试训练反馈'}</h1><p className="muted">{turns.length} 个回答已完成，综合 {scoredTurns.length} 题评分给出本轮反馈。</p></div><StatusBadge tone="success">{query.data.status === 'completed' ? '已完成' : '已结束'}</StatusBadge></header>
    <section className="feedback-score-panel"><div><span>综合表现</span><strong>{overall ?? '--'}</strong><small>{scoredTurns.length ? `基于 ${scoredTurns.length} 题四维评分平均` : '暂无评分数据'}</small></div><div className="feedback-score-metrics"><div className="dimension-grid">{scoredDimensions.map(([key, label]) => { const value = dimensionAverage(turns, key); return <div key={key}><span>{label}</span><strong>{value === null ? '--' : `${value}/100`}</strong><progress aria-label={`${label}维度均分 ${value === null ? '暂无评分' : `${value} 分`}`} max="100" value={value ?? 0} /></div>; })}</div><p className="citation-summary"><FileText size={14} />引用资料 {citationTotal} 条</p></div></section>
    <div className="feedback-grid"><section className="workspace-panel"><div className="section-heading"><h2><ListChecks size={18} />逐题回顾</h2><span>共 {turns.length} 题</span></div>{turns.length ? turns.map((turn, index) => { const score = turnScore(turn.evaluation); const turnStrengths = uniqueText(turn.evaluation?.strengths ?? []); const turnGaps = uniqueText(turn.evaluation?.gaps ?? []); return <article className="feedback-turn" key={turn.id}><div className="feedback-turn__head"><h3>第 {index + 1} 题 · {turn.question}</h3><strong>{score === null ? '--' : `${score} 分`}</strong></div><p>{turn.evaluation?.skipped ? '（本题已跳过，未作答）' : turn.answer}</p>{turn.evaluation?.skipped ? null : <div className="citation-strip"><FileText size={15} />{turn.citationIds?.length ? `引用 ${turn.citationIds.length} 条资料证据` : '本题没有识别到资料引用'}</div>}{turnStrengths.length ? <p className="feedback-turn__note">亮点：{turnStrengths.join('；')}</p> : null}{turnGaps.length ? <p className="feedback-turn__note">待补强：{turnGaps.join('；')}</p> : null}</article>; }) : <p className="widget-empty">本轮还没有已提交回答。</p>}</section><section className="workspace-panel"><h2><Lightbulb size={18} />下一步建议</h2><ul className="feedback-list"><li>{strengths[0] || '保持先结论后依据的表达结构。'}</li><li>{gaps[0] ? `待补强：${gaps[0]}` : '在回答中补充可验证的数据和引用。'}</li><li>前往复习区巩固本轮标记的薄弱点。</li></ul><Link className="button button--secondary" to="/app/interview/review-items">查看待复习</Link></section></div>
  </section>;
}
