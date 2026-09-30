import { ArrowRight, BrainCircuit, CircleGauge, Plus, Target } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, LoadingState, StatusBadge } from '../../components/ui';
import { listInterviewSessions, listReviewItems } from '../../api/interview';

export function InterviewPage() {
  const navigate = useNavigate();
  const sessions = useQuery({ queryKey: ['interview', 'sessions'], queryFn: listInterviewSessions });
  const reviews = useQuery({ queryKey: ['interview', 'reviews', 'pending'], queryFn: () => listReviewItems({ status: 'PENDING', page: 1, pageSize: 5 }) });
  const active = sessions.data?.find((session) => ['active', 'created', 'in_progress'].includes(session.status.toLowerCase()));
  const recent = sessions.data?.filter((session) => session !== active).slice(0, 4) ?? [];
  return <section className="page-section interview-page">
    <header className="page-heading"><div><p className="eyebrow">面试训练</p><h1>把知识练成表达</h1><p className="muted">基于你的资料集进行结构化问答，复盘每次回答的薄弱点。</p></div><Button onClick={() => void navigate('/app/interview/new')}><Plus size={17} />开始训练</Button></header>
    {active ? <section className="interview-continue"><div><StatusBadge tone="success">进行中</StatusBadge><h2>{active.title || '未命名训练'}</h2><p>{active.currentQuestion || '准备继续回答下一题'}</p></div><div className="interview-progress"><strong>{active.currentIndex ?? 0}<span>/{active.totalQuestions ?? 0} 题</span></strong><progress max={active.totalQuestions ?? 1} value={active.currentIndex ?? 0} /><Link className="button button--primary" to={`/app/interview/sessions/${active.id}`}>继续训练<ArrowRight size={16} /></Link></div></section> : <section className="workspace-panel interview-empty"><BrainCircuit size={30} /><div><h2>还没有进行中的训练</h2><p className="muted">选择一个资料集，开始一轮专注练习。</p></div><Button onClick={() => void navigate('/app/interview/new')}>配置训练</Button></section>}
    <section className="interview-stats" aria-label="训练统计"><article><CircleGauge size={20} /><strong>--</strong><span>平均得分</span></article><article><Target size={20} /><strong>{reviews.data?.total ?? 0}</strong><span>待复习</span></article><article><BrainCircuit size={20} /><strong>{sessions.data?.length ?? 0}</strong><span>训练场次</span></article></section>
    <div className="interview-grid"><section className="workspace-panel"><div className="section-heading"><h2>最近训练</h2><span>按时间排序</span></div>{sessions.isPending ? <LoadingState label="加载训练记录" /> : recent.length === 0 ? <p className="widget-empty">完成第一轮训练后，记录会显示在这里。</p> : <div className="interview-session-list">{recent.map((session) => <Link key={session.id} to={`/app/interview/sessions/${session.id}/feedback`}><div><strong>{session.title || '面试训练'}</strong><span>{session.currentIndex ?? 0}/{session.totalQuestions ?? 0} 题 · {session.status === 'completed' ? '已完成' : '未完成'}</span></div><ArrowRight size={16} /></Link>)}</div>}</section><section className="workspace-panel"><div className="section-heading"><h2>薄弱点与复习</h2><Link to="/app/interview/review-items">查看全部<ArrowRight size={15} /></Link></div><p className="muted interview-tip">完成训练后，系统会从回答中提取需要强化的概念。</p>{reviews.data?.items.slice(0, 3).map((item) => <Link className="interview-review-link" key={item.id} to={`/app/interview/review-items/${item.id}`}><span>{item.title}</span><StatusBadge tone="warning">待复习</StatusBadge></Link>)}</section></div>
  </section>;
}
