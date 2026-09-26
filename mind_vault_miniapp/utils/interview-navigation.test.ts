import {
  consumePendingInterviewSessionId,
  rememberInterviewSessionId,
} from './interview-navigation';

const storage = new Map<string, unknown>();
(globalThis as typeof globalThis & { wx: Record<string, unknown> }).wx = {
  setStorageSync(key: string, value: unknown) {
    storage.set(key, value);
  },
  getStorageSync(key: string) {
    return storage.get(key);
  },
  removeStorageSync(key: string) {
    storage.delete(key);
  },
};

rememberInterviewSessionId('1788976932493011');
if (consumePendingInterviewSessionId() !== '1788976932493011') {
  throw new Error('pending interview session id was not transferred');
}
if (consumePendingInterviewSessionId() !== '') {
  throw new Error('pending interview session id was not consumed');
}

console.log('interview navigation tests passed');
