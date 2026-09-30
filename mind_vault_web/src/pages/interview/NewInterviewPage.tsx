import { useState } from 'react';
import { ArrowLeft, LoaderCircle, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from '../../components/ui';
import { listDatasets } from '../../api/datasets';
import { createInterviewSessionStream } from '../../api/interview';
import { useSse } from '../../hooks/use-sse';
import { interviewConfigSchema, jobLabels, type InterviewConfig } from '../../features/interview/interview-schema';

const defaults: InterviewConfig = { dataset: '', job: 'system_design', mode: 'deep', count: 5, difficulty: 'intermediate', answerMode: 'text' };

export function NewInterviewPage() {
  const navigate = useNavigate();
  const datasets = useQuery({ queryKey: ['datasets', 'interview'], queryFn: () => listDatasets({ page: 1, pageSize: 100 }) });
  const stream = useSse();
  const [form, setForm] = useState(defaults);
  const [error, setError] = useState('');
  function update<K extends keyof InterviewConfig>(key: K, value: InterviewConfig[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = interviewConfigSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? '请检查训练配置'); return; }
    setError('');
    let sessionId = '';
    try {
      const streamRequest = createInterviewSessionStream({ datasetId: parsed.data.dataset, topic: parsed.data.job, intensity: parsed.data.mode, totalQuestions: parsed.data.count });
      await stream.start(streamRequest.path, {
        init: { method: 'POST', body: streamRequest.body },
        onEvent: (event) => {
          if (event.type === 'result') sessionId = String((event.result as { id?: string }).id ?? '');
          if (event.type === 'error') setError(event.message);
        },
      });
      if (sessionId) void navigate(`/app/interview/sessions/${sessionId}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '创建训练失败'); }
  }
  return <section className="page-section new-interview-page"><Link className="back-link" to="/app/interview"><ArrowLeft size={16} />返回训练首页</Link><header className="page-heading"><div><p className="eyebrow">新建训练</p><h1>配置一轮面试</h1><p className="muted">选择资料集和训练模式，AI 会根据你的资料生成问题。</p></div></header><form className="workspace-panel interview-form" onSubmit={submit}><label>资料集<select aria-label="资料集" onChange={(event) => update('dataset', event.target.value)} value={form.dataset}><option value="">请选择资料集</option>{datasets.data?.items.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.documentCount ?? 0} 份资料</option>)}</select></label><fieldset><legend>面试方向</legend><div className="choice-grid">{Object.entries(jobLabels).map(([value, label]) => <label className={form.job === value ? 'choice-card is-selected' : 'choice-card'} key={value}><input checked={form.job === value} name="job" onChange={() => update('job', value as InterviewConfig['job'])} type="radio" />{label}</label>)}</div></fieldset><div className="form-grid"><label>训练模式<select aria-label="训练模式" onChange={(event) => update('mode', event.target.value as InterviewConfig['mode'])} value={form.mode}><option value="quick">快速训练</option><option value="deep">深度追问</option></select></label><label>题目数量<Input aria-label="题目数量" max={20} min={1} onChange={(event) => update('count', Number(event.target.value))} type="number" value={form.count} /></label><label>难度<select aria-label="难度" onChange={(event) => update('difficulty', event.target.value as InterviewConfig['difficulty'])} value={form.difficulty}><option value="beginner">入门</option><option value="intermediate">进阶</option><option value="advanced">挑战</option></select></label><label>回答方式<select aria-label="回答方式" onChange={(event) => update('answerMode', event.target.value as InterviewConfig['answerMode'])} value={form.answerMode}><option value="text">文字回答</option><option value="voice">语音回答（即将支持）</option></select></label></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={stream.status === 'streaming' || form.answerMode === 'voice'} type="submit">{stream.status === 'streaming' ? <LoaderCircle className="spin-icon" size={17} /> : <Play size={17} />}开始训练</Button></form></section>;
}
