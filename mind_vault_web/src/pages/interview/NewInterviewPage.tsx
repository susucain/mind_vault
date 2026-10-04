import { useState } from 'react';
import { ArrowLeft, LoaderCircle, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from '../../components/ui';
import { DatasetSelect } from '@/components/shadcn/DatasetSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/ui/select';
import { listDatasets } from '../../api/datasets';
import { createInterviewSessionStream } from '../../api/interview';
import { useSse } from '../../hooks/use-sse';
import { interviewConfigSchema, topicLabels, type InterviewConfig } from '../../features/interview/interview-schema';

const defaults: InterviewConfig = { datasetId: '', topic: 'system_design', intensity: 'deep', focus: '', jobDescription: '', totalQuestions: 5 };

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
      const streamRequest = createInterviewSessionStream(parsed.data);
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
  return <section className="page-section new-interview-page"><Link className="back-link" to="/app/interview"><ArrowLeft size={16} />返回训练首页</Link><header className="page-heading"><div><p className="eyebrow">新建训练</p><h1>配置一轮面试</h1><p className="muted">选择资料集和训练模式，AI 会根据你的资料生成问题。</p></div></header><form className="workspace-panel interview-form" onSubmit={submit}><label>资料集<DatasetSelect aria-label="资料集" datasets={datasets.data?.items ?? []} onChange={(value) => update('datasetId', value)} searchable value={form.datasetId} /></label><fieldset><legend>面试方向</legend><div className="choice-grid">{Object.entries(topicLabels).map(([value, label]) => <label className={form.topic === value ? 'choice-card is-selected' : 'choice-card'} key={value}><input checked={form.topic === value} name="topic" onChange={() => update('topic', value as InterviewConfig['topic'])} type="radio" />{label}</label>)}</div></fieldset><div className="form-grid"><label>训练模式<Select onValueChange={(value) => update('intensity', value as InterviewConfig['intensity'])} value={form.intensity}><SelectTrigger aria-label="训练模式" className="w-full bg-surface"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="quick">快速训练</SelectItem><SelectItem value="deep">深度追问</SelectItem></SelectContent></Select></label><label>题目数量<Input aria-label="题目数量" max={20} min={1} onChange={(event) => update('totalQuestions', Number(event.target.value))} type="number" value={form.totalQuestions} /></label></div><div className="form-grid"><label>重点练习方向<Input aria-label="重点练习方向" maxLength={200} onChange={(event) => update('focus', event.target.value)} placeholder="例如：缓存一致性、故障恢复" value={form.focus ?? ''} /></label><label>目标岗位描述<textarea aria-label="目标岗位描述" maxLength={2000} onChange={(event) => update('jobDescription', event.target.value)} placeholder="可选，帮助生成更贴近目标岗位的问题" rows={4} value={form.jobDescription ?? ''} /></label></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<Button disabled={stream.status === 'streaming'} type="submit">{stream.status === 'streaming' ? <LoaderCircle className="spin-icon" size={17} /> : <Play size={17} />}开始训练</Button></form></section>;
}
