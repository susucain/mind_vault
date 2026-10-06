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

/** 主题说明：帮助用户在配置前理解各方向的考察重点。 */
export const topicHints: Record<InterviewConfig['topic'], string> = {
  project_deep_dive: '深挖资料中的项目细节、取舍与复盘',
  technical_fundamentals: '考察原理、边界条件与常见误区',
  job_fit: '围绕目标岗位职责匹配你的经验',
  system_design: '给出开放设计题，考察容量、扩展与容错',
};

/** 强度说明：区分两种模式的出题与追问方式。 */
export const intensityHints: Record<InterviewConfig['intensity'], string> = {
  quick: '快速：每题独立出新题',
  deep: '深度：基于本题追问',
};
