import { jsonRequest, request } from './client';
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

function queryString(query: object): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}

export const createInterviewSession = (input: InterviewSessionInput) =>
  jsonRequest<InterviewSession>('/interview/sessions', 'POST', input);
export const listInterviewSessions = () => request<InterviewSession[]>('/interview/sessions');
export const getInterviewSession = (id: string) => request<InterviewSession>(`/interview/sessions/${id}`);
export const submitInterviewAnswer = (id: string, answer: string) =>
  jsonRequest<unknown>(`/interview/sessions/${id}/answers`, 'POST', { answer });
export const finishInterviewSession = (id: string) =>
  jsonRequest<InterviewSession>(`/interview/sessions/${id}/finish`, 'POST');
export const listReviewItems = (query: { status?: 'PENDING' | 'COMPLETED'; page?: number; pageSize?: number } = {}) =>
  request<PageResult<ReviewItem>>(`/interview/review-items?${queryString(query)}`);
export const getReviewItem = (id: string) => request<ReviewItem>(`/interview/review-items/${id}`);
export const submitReviewAnswer = (id: string, answer: string) =>
  jsonRequest<ReviewItem>(`/interview/review-items/${id}/answers`, 'POST', { answer });
export const updateReviewItem = (id: string, status: 'PENDING' | 'COMPLETED') =>
  jsonRequest<ReviewItem>(`/interview/review-items/${id}`, 'PATCH', { status });
