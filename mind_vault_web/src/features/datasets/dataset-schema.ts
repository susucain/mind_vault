import { z } from 'zod';

export const datasetSchema = z.object({
  name: z.string().trim().min(1, '请输入资料集名称').max(80, '名称不能超过 80 个字符'),
  description: z.string().trim().max(500, '说明不能超过 500 个字符').optional(),
});

export type DatasetFormValue = z.infer<typeof datasetSchema>;
