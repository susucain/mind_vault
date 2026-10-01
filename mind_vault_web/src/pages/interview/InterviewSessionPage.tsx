import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock3, Flag, LoaderCircle, Send, SkipForward, Square, WifiOff } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, LoadingState } from '../../components/ui';
import { getInterviewSession, submitInterviewAnswerStream, finishInterviewSession } from '../../api/interview';
import { useSse } from '../../hooks/use-sse';
import { applyInterviewEvent, createSessionState } from '../../features/interview/session-state';

const draftKey = (id: string) => `mind-vault:interview-draft:${id}`;

export function InterviewSessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['interview', 'session', sessionId], queryFn: () => getInterviewSession(sessionId), enabled: Boolean(sessionId) });
  const stream = useSse();
  const [state, setState] = useState(() => createSessionState({}));
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.data) return;
    const saved = localStorage.getItem(draftKey(sessionId));
    // Hydrate query data and the persisted draft into the interactive session state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((current) => ({ ...createSessionState({ question: query.data.currentQuestion, totalQuestions: query.data.totalQuestions, answered: query.data.currentIndex }), ...current, question: query.data.currentQuestion ?? '', draft: saved ?? current.draft }));
  }, [query.data, sessionId]);
  useEffect(() => { const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (sessionId && state.draft) localStorage.setItem(draftKey(sessionId), state.draft); }, [sessionId, state.draft]);
  const progress = useMemo(() => Math.min(100, Math.round((state.answered / Math.max(state.totalQuestions, 1)) * 100)), [state]);
  async function submit(event: FormEvent, answer = state.draft) {
    event.preventDefault();
    if (!answer.trim() || !state.question || stream.status === 'streaming') return;
    setError('');
    await stream.start(submitInterviewAnswerStream(sessionId, answer.trim()).path, { init: { method: 'POST', body: submitInterviewAnswerStream(sessionId, answer.trim()).body }, onEvent: (next) => {
      setState((current) => applyInterviewEvent(current, next));
      if (next.type === 'error') setError(next.message);
      if (next.type === 'result') { setState((current) => ({ ...applyInterviewEvent(current, next), draft: '' })); query.refetch(); }
    }}).catch((caught) => setError(caught instanceof Error ? caught.message : '提交失败'));
  }
  async function end() { await finishInterviewSession(sessionId); localStorage.removeItem(draftKey(sessionId)); void navigate(`/app/interview/sessions/${sessionId}/feedback`); }
  if (query.isPending) return <LoadingState label="加载训练会话" />;
  if (query.isError || !query.data) return <section className="page-section"><p className="form-error">训练会话加载失败。</p></section>;
  return <section className="interview-session-page"><header className="session-header"><div><p className="eyebrow">面试训练</p><h1>{query.data.title || '训练会话'}</h1></div><Button onClick={() => void end()} variant="secondary"><Square size={15} />结束训练</Button></header><div className="session-progress"><span>第 {Math.min(state.answered + 1, state.totalQuestions)} / {state.totalQuestions} 题</span><progress max="100" value={progress} /><span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></div><main className="session-layout"><section className="question-panel"><div className="question-meta"><span>当前问题</span>{stream.status === 'streaming' ? <span><LoaderCircle className="spin-icon" size={14} />评估中</span> : <span><Clock3 size={14} />计时中</span>}</div><h2>{state.question || '本轮训练已完成'}</h2><form onSubmit={submit}><textarea aria-label="你的回答" disabled={!state.question || stream.status === 'streaming'} onChange={(event) => setState((current) => ({ ...current, draft: event.target.value }))} placeholder="组织你的思路，尽量引用资料中的事实和依据…" rows={10} value={state.draft} /><div className="answer-actions"><Button disabled={!state.question || stream.status === 'streaming' || !state.draft.trim()} type="submit"><Send size={16} />提交回答</Button><Button disabled={!state.question || stream.status === 'streaming'} onClick={(event) => void submit(event, '跳过本题')} type="button" variant="ghost"><SkipForward size={16} />跳过</Button></div></form>{state.interrupted || error ? <div className="chat-interrupted" role="alert"><WifiOff size={16} /><span>{error || '连接中断，题目和草稿已保留。'}</span><Button onClick={(event) => void submit(event)} variant="secondary">重试提交</Button></div> : null}</section><aside className="session-side"><div className="workspace-panel"><h2>回答建议</h2><ul className="session-tips"><li>先给出结论，再说明判断依据。</li><li>结合资料中的项目细节和数据。</li><li>说明取舍、风险与验证方式。</li></ul></div><Button onClick={() => void end()} variant="secondary"><Flag size={16} />提前结束并查看反馈</Button></aside></main></section>;
}
