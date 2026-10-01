import { z } from 'zod';

export const interviewConfigSchema = z.object({
  datasetId: z.string().trim().min(1, '请选择资料集'),
  topic: z.enum(['project_deep_dive', 'technical_fundamentals', 'job_fit', 'system_design']),
  intensity: z.enum(['quick', 'deep']),
  focus: z.string().trim().max(200, '重点方向不能超过 200 个字符').optional(),
  jobDescription: z.string().trim().max(2000, '岗位描述不能超过 2000 个字符').optional(),
  totalQuestions: z.number().int().min(1, '至少训练 1 题').max(20, '最多训练 20 题'),
});

export type InterviewConfig = z.infer<typeof interviewConfigSchema>;

export const topicLabels: Record<InterviewConfig['topic'], string> = {
  project_deep_dive: '项目深挖',
  technical_fundamentals: '技术基础',
  job_fit: '岗位匹配',
  system_design: '系统设计',
};
