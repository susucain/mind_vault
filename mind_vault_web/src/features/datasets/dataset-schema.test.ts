import { describe, expect, it } from 'vitest';
import { datasetSchema } from './dataset-schema';

describe('datasetSchema', () => {
  it('requires a trimmed name and limits descriptions', () => {
    expect(datasetSchema.safeParse({ name: '   ', description: '' }).success).toBe(false);
    expect(datasetSchema.safeParse({ name: '前端资料', description: 'a'.repeat(501) }).success).toBe(false);
    expect(datasetSchema.parse({ name: '  前端资料  ', description: '  核心文档  ' })).toEqual({
      name: '前端资料',
      description: '核心文档',
    });
  });
});
