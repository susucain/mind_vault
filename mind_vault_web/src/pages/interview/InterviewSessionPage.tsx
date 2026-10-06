import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock3, Flag, LoaderCircle, Send, SkipForward, Square, WifiOff } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, LoadingState } from '../../components/ui';
import { getInterviewSession, submitInterviewAnswerStream, skipInterviewQuestionStream, finishInterviewSession } from '../../api/interview';
import type { InterviewEvaluation } from '../../api/interview';
import { useSse } from '../../hooks/use-sse';
import { applyInterviewEvent, createSessionState, stageLabel } from '../../features/interview/session-state';

const draftKey = (id: string) => `mind-vault:interview-draft:${id}`;
const scoredKeys = ['accuracy', 'depth', 'structure', 'clarity'] as const;

/** 单题得分：四维评分均值；跳过题返回 null。 */
function turnScore(evaluation?: Partial<InterviewEvaluation> | null): number | null {
  if (!evaluation) return null;
  const values = scoredKeys.map((key) => evaluation[key]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!values.length) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

/** 计时展示：分:秒。 */
function formatDuration(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function InterviewSessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['interview', 'session', sessionId], queryFn: () => getInterviewSession(sessionId), enabled: Boolean(sessionId) });
  const stream = useSse();
  const [state, setState] = useState(() => createSessionState({}));
  const [seconds, setSeconds] = useState(0);
  const [questionSeconds, setQuestionSeconds] = useState(0);
  const [error, setError] = useState('');
  const [endError, setEndError] = useState('');

  useEffect(() => {
    if (!query.data) return;
    const saved = localStorage.getItem(draftKey(sessionId));
    // Hydrate server-side progress into the interactive state. Server values must win over
    // the stale initial defaults, while the local draft and streaming flags are preserved.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((current) => ({ ...current, question: query.data.currentQuestion ?? '', answered: query.data.currentIndex ?? current.answered, totalQuestions: query.data.totalQuestions ?? current.totalQuestions, draft: saved ?? current.draft }));
  }, [query.data, sessionId]);
  useEffect(() => { const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    // 换题时重置单题计时；评估中暂停，回到作答态继续累计。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuestionSeconds(0);
  }, [state.question]);
  useEffect(() => {
    if (stream.status === 'streaming') return;
    const timer = window.setInterval(() => setQuestionSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [stream.status]);
  useEffect(() => { if (sessionId && state.draft) localStorage.setItem(draftKey(sessionId), state.draft); }, [sessionId, state.draft]);
  const progress = useMemo(() => Math.min(100, Math.round((state.answered / Math.max(state.totalQuestions, 1)) * 100)), [state]);
  const answeredTurns = query.data?.turns ?? [];

  async function send(request: { path: string; body: Record<string, unknown> }) {
    if (!state.question || stream.status === 'streaming') return;
    setError('');
    await stream.start(request.path, { init: { method: 'POST', body: request.body }, onEvent: (next) => {
      setState((current) => applyInterviewEvent(current, next));
      if (next.type === 'error') setError(next.message);
      if (next.type === 'result') { setState((current) => ({ ...applyInterviewEvent(current, next), draft: '' })); query.refetch(); }
    }}).catch((caught) => setError(caught instanceof Error ? caught.message : '提交失败'));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!state.draft.trim()) return;
    void send(submitInterviewAnswerStream(sessionId, state.draft.trim()));
  }

  function onSkip() {
    void send(skipInterviewQuestionStream(sessionId));
  }

  async function end() {
    setEndError('');
    try {
      await finishInterviewSession(sessionId);
      localStorage.removeItem(draftKey(sessionId));
      void navigate(`/app/interview/sessions/${sessionId}/feedback`);
    } catch (caught) {
      setEndError(caught instanceof Error ? caught.message : '结束训练失败，请重试');
    }
  }
  if (query.isPending) return <LoadingState label="加载训练会话" />;
  if (query.isError || !query.data) return <section className="page-section"><ErrorState onRetry={() => void query.refetch()} title="训练会话加载失败，请重试" /></section>;
  return <section className="interview-session-page"><header className="session-header"><div><p className="eyebrow">面试训练</p><h1>{query.data.title || '训练会话'}</h1></div><Button onClick={() => void end()} variant="secondary"><Square size={15} />结束训练</Button></header><div aria-label="答题进度与用时" className="session-progress" role="group"><span>第 {Math.min(state.answered + 1, state.totalQuestions)} / {state.totalQuestions} 题</span><progress aria-label={`已完成 ${state.answered} 题，共 ${state.totalQuestions} 题`} max="100" value={progress} /><span role="timer">本题 {formatDuration(questionSeconds)}</span><span role="timer">总用时 {formatDuration(seconds)}</span></div>{endError ? <p className="form-error" role="alert">{endError}</p> : null}<main className="session-layout"><section className="question-panel"><div className="question-meta"><span>当前问题</span>{stream.status === 'streaming' ? <span role="status"><LoaderCircle aria-hidden="true" className="spin-icon" size={14} />{stageLabel(state.stage, 'answer')}</span> : <span><Clock3 aria-hidden="true" size={14} />计时中</span>}</div><h2>{state.question || '本轮训练已完成'}</h2><form onSubmit={onSubmit}><textarea aria-label="你的回答" disabled={!state.question || stream.status === 'streaming'} onChange={(event) => setState((current) => ({ ...current, draft: event.target.value }))} placeholder="组织你的思路，尽量引用资料中的事实和依据…" rows={10} value={state.draft} /><div className="answer-actions"><Button disabled={!state.question || stream.status === 'streaming' || !state.draft.trim()} type="submit"><Send size={16} />提交回答</Button><Button disabled={!state.question || stream.status === 'streaming'} onClick={onSkip} type="button" variant="ghost"><SkipForward size={16} />跳过</Button></div></form>{state.interrupted || error ? <div className="chat-interrupted" role="alert"><WifiOff size={16} /><span>{error || '连接中断，题目和草稿已保留。'}</span><Button onClick={() => { if (state.draft.trim()) void send(submitInterviewAnswerStream(sessionId, state.draft.trim())); }} variant="secondary">重试提交</Button></div> : null}</section><aside className="session-side"><div className="workspace-panel"><h2>回答建议</h2><ul className="session-tips"><li>先给出结论，再说明判断依据。</li><li>结合资料中的项目细节和数据。</li><li>说明取舍、风险与验证方式。</li></ul></div>{answeredTurns.length ? <details className="workspace-panel session-history"><summary>已答题（{answeredTurns.length}）</summary><ol className="session-history__list">{answeredTurns.map((turn, index) => { const score = turnScore(turn.evaluation); const skipped = turn.evaluation?.skipped; return <li key={turn.id}><div className="session-history__head"><strong>第 {index + 1} 题</strong><span>{skipped ? '已跳过' : score === null ? '--' : `${score} 分`}</span></div><p className="session-history__question">{turn.question}</p><p className="session-history__answer">{skipped ? '（本题未作答）' : turn.answer}</p></li>; })}</ol></details> : null}<Button onClick={() => void end()} variant="secondary"><Flag size={16} />提前结束并查看反馈</Button></aside></main></section>;
}
