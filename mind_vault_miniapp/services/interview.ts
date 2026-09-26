import { request } from './request';
import { environment } from '../config/env';
import {
  InterviewAnswerResult,
  InterviewMode,
  InterviewSession,
  ReviewAnswerResult,
  ReviewDetail,
  ReviewItem,
  ReviewItemsPage,
  ReviewStatus,
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

export function listReviewItems(
  status: ReviewStatus = 'PENDING',
  page = 1,
  pageSize = 20
) {
  return request<ReviewItemsPage>({
    path: `/interview/review-items?status=${status}&page=${page}&pageSize=${pageSize}`,
  });
}

export function getReviewItem(id: string) {
  return request<ReviewDetail>({
    path: `/interview/review-items/${id}`,
  });
}

export function submitReviewAnswer(id: string, answer: string) {
  return request<ReviewAnswerResult, { answer: string }>({
    path: `/interview/review-items/${id}/answers`,
    method: 'POST',
    timeout: environment.interviewAnswerTimeout,
    data: { answer },
  });
}

export function updateReviewItemStatus(id: string, status: ReviewStatus) {
  return request<ReviewItem, { status: ReviewStatus }>({
    path: `/interview/review-items/${id}`,
    method: 'PATCH',
    data: { status },
  });
}
