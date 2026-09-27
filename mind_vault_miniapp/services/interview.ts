import { request } from './request';
import { environment } from '../config/env';
import { loadSession } from '../utils/session';
import { SseEvent, SseParser } from '../utils/sse';
import {
  InterviewAnswerResult,
  InterviewIntensity,
  InterviewSession,
  InterviewTopic,
  ReviewAnswerResult,
  ReviewDetail,
  ReviewItem,
  ReviewItemsPage,
  ReviewStatus,
} from '../types/interview';

export function createInterviewSession(input: {
  datasetId: string;
  topic: InterviewTopic;
  intensity: InterviewIntensity;
  focus?: string;
  jobDescription?: string;
  totalQuestions: number;
}) {
  return request<InterviewSession, typeof input>({
    path: '/interview/sessions',
    method: 'POST',
    timeout: environment.interviewSessionTimeout,
    data: input,
  });
}

/** 检索加模型生成要十秒以上，onStage 用来把后端阶段实时显示给用户 */
export function streamInterviewSession(
  input: {
    datasetId: string;
    topic: InterviewTopic;
    intensity: InterviewIntensity;
    focus?: string;
    jobDescription?: string;
    totalQuestions: number;
  },
  onStage: (stage: string) => void
) {
  return streamInterview<InterviewSession>(
    '/interview/sessions/stream',
    input,
    onStage
  );
}

export function streamInterviewAnswer(
  id: string,
  answer: string,
  onStage: (stage: string) => void
) {
  return streamInterview<InterviewAnswerResult>(
    `/interview/sessions/${id}/answers/stream`,
    { answer },
    onStage
  );
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

/** 事件协议与后端一致：stage 报阶段，result 给最终数据，error/done 收尾 */
function streamInterview<T>(
  path: string,
  data: Record<string, unknown>,
  onStage: (stage: string) => void
): Promise<T> {
  const session = loadSession();
  if (!session) return Promise.reject(new Error('登录已失效'));
  return new Promise<T>((resolve, reject) => {
    const parser = new SseParser();
    let settled = false;
    let result: T | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else if (result === undefined) reject(new Error('训练响应不完整'));
      else resolve(result);
    };
    const handleEvent = (event: SseEvent) => {
      if (event.event === 'stage') {
        const stage = event.data.stage;
        if (typeof stage === 'string') onStage(stage);
        return;
      }
      if (event.event === 'result') {
        result = event.data as unknown as T;
        return;
      }
      if (event.event === 'error') {
        const message = event.data.message;
        finish(new Error(typeof message === 'string' ? message : '训练失败'));
      }
    };
    const task = wx.request({
      url: `${environment.apiBaseUrl}${path}`,
      method: 'POST',
      enableChunked: true,
      dataType: 'other',
      timeout: environment.streamTimeout,
      data,
      header: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          finish(new Error(`训练请求失败：${response.statusCode}`));
          return;
        }
        finish();
      },
      fail(error) {
        finish(new Error(error.errMsg || '训练连接失败'));
      },
    });
    task.onChunkReceived((chunk) => {
      for (const event of parser.push(chunk.data)) handleEvent(event);
    });
  });
}

export function updateReviewItemStatus(id: string, status: ReviewStatus) {
  return request<ReviewItem, { status: ReviewStatus }>({
    path: `/interview/review-items/${id}`,
    method: 'PATCH',
    data: { status },
  });
}
