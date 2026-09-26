import { createInterviewSession, submitInterviewAnswer } from './interview';

const storage = new Map<string, unknown>();
const requests: Array<Record<string, unknown>> = [];

(globalThis as typeof globalThis & { wx: Record<string, unknown> }).wx = {
  getStorageSync(key: string) {
    return storage.get(key);
  },
  setStorageSync(key: string, value: unknown) {
    storage.set(key, value);
  },
  request(options: Record<string, unknown>) {
    requests.push(options);
    const success = options.success as (response: unknown) => void;
    success({ statusCode: 200, header: {}, data: {} });
    return {};
  },
};

storage.set('mind-vault-session', {
  accessToken: 'test-token',
  user: { id: 'user_1' },
});

void createInterviewSession({
  datasetId: 'dataset_1',
  topic: 'technical_fundamentals',
  intensity: 'deep',
  totalQuestions: 5,
})
  .then(() => submitInterviewAnswer('session_1', '回答内容'))
  .then(() => {
    if (requests[0]?.timeout !== 60_000) {
      throw new Error(
        `expected interview creation timeout, got ${String(
          requests[0]?.timeout
        )}`
      );
    }
    if (requests[1]?.timeout !== 120_000) {
      throw new Error(
        `expected interview answer timeout, got ${String(requests[1]?.timeout)}`
      );
    }

    console.log('interview request timeout tests passed');
  });
