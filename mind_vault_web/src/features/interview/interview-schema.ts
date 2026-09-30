import { z } from 'zod';

export const interviewConfigSchema = z.object({
  dataset: z.string().trim().min(1, '请选择资料集'),
  job: z.enum(['project_deep_dive', 'technical_fundamentals', 'job_fit', 'system_design']),
  mode: z.enum(['quick', 'deep']),
  count: z.number().int().min(1, '至少训练 1 题').max(20, '最多训练 20 题'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  answerMode: z.enum(['text', 'voice']),
});

export type InterviewConfig = z.infer<typeof interviewConfigSchema>;

export const jobLabels: Record<InterviewConfig['job'], string> = {
  project_deep_dive: '项目深挖',
  technical_fundamentals: '技术基础',
  job_fit: '岗位匹配',
  system_design: '系统设计',
};
