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

/** 等待反馈的操作类型：创建会话（检索 + 出题）与提交答案（评估 + 出下一题）。 */
export type InterviewStageOperation = 'create' | 'answer';

const STAGE_LABELS: Record<InterviewStageOperation, Record<string, string>> = {
  create: {
    preparing: '正在准备资料集…',
    retrieving: '正在检索相关资料…',
    generating: '正在生成第一题…',
  },
  answer: {
    preparing: '正在准备评估…',
    retrieving: '正在检索参考依据…',
    evaluating: '正在评估你的回答…',
    generating: '正在生成下一题…',
  },
};

const STAGE_FALLBACK: Record<InterviewStageOperation, string> = {
  create: '正在检索资料并生成第一题…',
  answer: '正在评估你的回答，并准备下一题…',
};

/** 阶段文案：把后端 stage 映射为可读提示，未知阶段回退到该操作的默认文案。 */
export function stageLabel(stage: string, operation: InterviewStageOperation = 'create'): string {
  return STAGE_LABELS[operation][stage] ?? STAGE_FALLBACK[operation];
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
    draft: '',
    answered: state.answered + 1,
    stage: 'ready',
    interrupted: false,
    lastResult: result,
  };
}
