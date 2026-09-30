import type { StreamEvent } from '../../hooks/use-sse';

export interface InterviewSessionState {
  question: string;
  draft: string;
  answered: number;
  totalQuestions: number;
  stage: string;
  interrupted: boolean;
  lastResult?: Record<string, unknown>;
}

export function createSessionState(input: { question?: string | null; totalQuestions?: number; answered?: number }): InterviewSessionState {
  return {
    question: input.question ?? '',
    draft: '',
    answered: input.answered ?? 0,
    totalQuestions: input.totalQuestions ?? 1,
    stage: 'ready',
    interrupted: false,
  };
}

export function applyInterviewEvent(state: InterviewSessionState, event: StreamEvent): InterviewSessionState {
  if (event.type === 'status') return { ...state, stage: event.backendStage, interrupted: false };
  if (event.type === 'error') return { ...state, interrupted: true, stage: 'interrupted' };
  if (event.type !== 'result') return state;
  const result = (event.result ?? {}) as Record<string, unknown>;
  return {
    ...state,
    question: typeof result.nextQuestion === 'string' ? result.nextQuestion : '',
    answered: state.answered + 1,
    stage: 'ready',
    interrupted: false,
    lastResult: result,
  };
}
