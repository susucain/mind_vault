import { jsonRequest, request } from './client';
import { appConfig } from '../lib/config';
import type { PageResult } from '../types/api';
import type { InterviewSession, ReviewItem } from '../types/domain';

export interface InterviewSessionInput {
  datasetId: string;
  topic: 'project_deep_dive' | 'technical_fundamentals' | 'job_fit' | 'system_design';
  intensity: 'quick' | 'deep';
  focus?: string;
  jobDescription?: string;
  totalQuestions?: number;
}

export interface InterviewAnswerResult {
  turn?: InterviewTurnResponse;
  evaluation?: Record<string, unknown>;
  citations?: string[];
  nextQuestion?: string | null;
  reviewItems?: ReviewItemRecord[];
  status?: string;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}

export const createInterviewSession = (input: InterviewSessionInput) =>
  jsonRequest<InterviewSession>('/interview/sessions', 'POST', input);

interface BackendInterviewSession extends Omit<InterviewSession, 'status'> {
  status: string;
}

interface BackendSessionList {
  items: BackendInterviewSession[];
}

export interface ReviewItemRecord extends ReviewItem {
  sourceTurnId: string;
  status: 'PENDING' | 'COMPLETED';
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  lastReviewedAt?: string | null;
}

export interface InterviewTurnResponse {
  id: string;
  sessionId: string;
  ownerId: string;
  question: string;
  answer: string;
  evaluation: Record<string, unknown>;
  citationIds: string[];
  createdAt: string;
}

export interface ReviewAttemptResponse {
  id: string;
  reviewItemId: string;
  ownerId: string;
  answer: string;
  evaluation: Record<string, unknown>;
  citationIds: string[];
  score: string;
  createdAt: string;
}

export interface ReviewItemDetailResponse {
  item: ReviewItemRecord;
  sourceTurn: InterviewTurnResponse | null;
  sourceTopic: string | null;
  attempts: ReviewAttemptResponse[];
}

export interface SubmitReviewAnswerResponse {
  attempt: ReviewAttemptResponse;
  item: ReviewItemRecord;
  autoCompleted: boolean;
  score: number;
}

const mockSessions: BackendInterviewSession[] = [{
  id: 'mock-i1',
  datasetId: 'mock-d1',
  topic: 'system_design',
  title: '系统设计训练',
  status: 'IN_PROGRESS',
  currentIndex: 3,
  totalQuestions: 6,
  currentQuestion: '如何设计高可用缓存？',
  createdAt: '2026-09-29',
}];

const mockReviewItems: ReviewItemRecord[] = [
  {
    id: 'mock-r1',
    sessionId: 'mock-i1',
    sourceTurnId: 'mock-turn-1',
    title: '解释缓存一致性策略',
    prompt: '解释缓存一致性策略',
    nextReviewAt: '2026-09-30',
    status: 'PENDING',
    createdAt: '2026-09-29T08:00:00Z',
    updatedAt: '2026-09-29T08:00:00Z',
  },
  {
    id: 'mock-r2',
    sessionId: 'mock-i1',
    sourceTurnId: 'mock-turn-2',
    title: '设计限流系统',
    prompt: '设计限流系统',
    nextReviewAt: '2026-09-30',
    status: 'PENDING',
    createdAt: '2026-09-29T08:05:00Z',
    updatedAt: '2026-09-29T08:05:00Z',
  },
];

function normalizeSession(session: BackendInterviewSession): InterviewSession {
  const backendStatus = session.status.toUpperCase();
  const status = backendStatus === 'IN_PROGRESS'
    ? 'active'
    : backendStatus === 'CREATED'
      ? 'created'
      : backendStatus === 'COMPLETED'
        ? 'completed'
        : session.status.toLowerCase();
  return { ...session, status };
}

export async function listInterviewSessions(): Promise<InterviewSession[]> {
  const response = appConfig.enableMockApi
    ? { items: mockSessions }
    : await request<BackendSessionList>('/interview/sessions');
  return response.items.map(normalizeSession);
}
export async function getInterviewSession(id: string): Promise<InterviewSession & { turns?: InterviewTurnResponse[] }> {
  const response = await request<InterviewSession & { turns?: InterviewTurnResponse[] } | { data: InterviewSession & { turns?: InterviewTurnResponse[] } }>(`/interview/sessions/${id}`);
  return 'data' in response ? response.data : response;
}
export const submitInterviewAnswer = (id: string, answer: string) =>
  jsonRequest<InterviewAnswerResult>(`/interview/sessions/${id}/answers`, 'POST', { answer });
export const submitInterviewAnswerStream = (id: string, answer: string) =>
  ({ path: `/interview/sessions/${id}/answers/stream`, body: { answer } });
export const createInterviewSessionStream = (input: InterviewSessionInput) =>
  ({ path: '/interview/sessions/stream', body: { ...input } });
export const finishInterviewSession = (id: string) =>
  jsonRequest<InterviewSession>(`/interview/sessions/${id}/finish`, 'POST');
export const listReviewItems = (query: { status?: 'PENDING' | 'COMPLETED'; page?: number; pageSize?: number } = {}) => {
  if (appConfig.enableMockApi) {
    const items = query.status === 'COMPLETED' ? [] : mockReviewItems;
    return Promise.resolve({ items, total: items.length, page: query.page ?? 1, pageSize: query.pageSize ?? 20 });
  }
  return request<PageResult<ReviewItemRecord>>(`/interview/review-items?${queryString(query)}`);
};
export const getReviewItem = (id: string) =>
  request<ReviewItemDetailResponse>(`/interview/review-items/${id}`);
export const submitReviewAnswer = (id: string, answer: string) =>
  jsonRequest<SubmitReviewAnswerResponse>(`/interview/review-items/${id}/answers`, 'POST', { answer });
export const updateReviewItem = (id: string, status: 'PENDING' | 'COMPLETED') =>
  jsonRequest<ReviewItemRecord>(`/interview/review-items/${id}`, 'PATCH', { status });
