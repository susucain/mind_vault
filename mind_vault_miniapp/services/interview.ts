import { request } from './request';
import { environment } from '../config/env';
import {
  InterviewAnswerResult,
  InterviewMode,
  InterviewSession,
  ReviewItem,
} from '../types/interview';

export function createInterviewSession(input: {
  datasetId: string;
  mode: InterviewMode;
  totalQuestions: number;
}) {
  return request<InterviewSession, typeof input>({
    path: '/interview/sessions',
    method: 'POST',
    timeout: environment.interviewSessionTimeout,
    data: input,
  });
}

export function getInterviewSession(id: string) {
  return request<InterviewSession>({
    path: `/interview/sessions/${id}`,
  });
}

export function listInterviewSessions() {
  return request<{ items: InterviewSession[] }>({
    path: '/interview/sessions',
  });
}

export function submitInterviewAnswer(id: string, answer: string) {
  return request<InterviewAnswerResult, { answer: string }>({
    path: `/interview/sessions/${id}/answers`,
    method: 'POST',
    timeout: environment.interviewAnswerTimeout,
    data: { answer },
  });
}

export function finishInterviewSession(id: string) {
  return request<InterviewSession>({
    path: `/interview/sessions/${id}/finish`,
    method: 'POST',
  });
}

export function listReviewItems() {
  return request<ReviewItem[]>({
    path: '/interview/review-items',
  });
}
