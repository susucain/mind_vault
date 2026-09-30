import { describe, expect, it } from 'vitest';
import { interviewConfigSchema } from './interview-schema';

describe('interviewConfigSchema', () => {
  it('accepts a complete training configuration', () => {
    expect(interviewConfigSchema.parse({
      dataset: 'dataset-1',
      job: 'system_design',
      mode: 'deep',
      count: 5,
      difficulty: 'intermediate',
      answerMode: 'text',
    })).toMatchObject({ dataset: 'dataset-1', count: 5 });
  });

  it('rejects missing dataset and an out-of-range count', () => {
    const result = interviewConfigSchema.safeParse({
      dataset: '',
      job: 'system_design',
      mode: 'quick',
      count: 0,
      difficulty: 'beginner',
      answerMode: 'text',
    });
    expect(result.success).toBe(false);
  });
});
