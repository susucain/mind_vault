import { describe, expect, it } from 'vitest';
import { interviewConfigSchema } from './interview-schema';

describe('interviewConfigSchema', () => {
  it('accepts a complete training configuration', () => {
    expect(interviewConfigSchema.parse({
      datasetId: 'dataset-1',
      topic: 'system_design',
      intensity: 'deep',
      focus: '缓存与高可用',
      jobDescription: '负责平台基础设施建设',
      totalQuestions: 5,
    })).toEqual({
      datasetId: 'dataset-1',
      topic: 'system_design',
      intensity: 'deep',
      focus: '缓存与高可用',
      jobDescription: '负责平台基础设施建设',
      totalQuestions: 5,
    });
  });

  it('rejects missing dataset and an out-of-range count', () => {
    const result = interviewConfigSchema.safeParse({
      datasetId: '',
      topic: 'system_design',
      intensity: 'quick',
      totalQuestions: 0,
    });
    expect(result.success).toBe(false);
  });

  it('does not accept unsupported difficulty or answer mode fields', () => {
    const result = interviewConfigSchema.safeParse({
      datasetId: 'dataset-1',
      topic: 'system_design',
      intensity: 'deep',
      totalQuestions: 5,
      difficulty: 'advanced',
      answerMode: 'voice',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('difficulty');
      expect(result.data).not.toHaveProperty('answerMode');
    }
  });
});
