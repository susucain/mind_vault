export type InterviewTopic =
  'project_deep_dive' | 'technical_fundamentals' | 'job_fit' | 'system_design';

export type InterviewIntensity = 'quick' | 'deep';

export interface InterviewEvaluation {
  accuracy: number;
  depth: number;
  structure: number;
  clarity: number;
  strengths: string[];
  gaps: string[];
  followUp: string;
  reviewItems: string[];
}

export interface InterviewTurn {
  id: string;
  question: string;
  answer: string;
  evaluation: InterviewEvaluation;
  citationIds: string[];
  createdAt: string;
}

export interface InterviewSession {
  id: string;
  datasetId: string;
  topic: InterviewTopic;
  intensity: InterviewIntensity;
  focus?: string | null;
  jobDescription?: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED';
  currentIndex: number;
  totalQuestions: number;
  currentQuestion?: string | null;
  createdAt: string;
  updatedAt: string;
  turns?: InterviewTurn[];
}

export type ReviewStatus = 'PENDING' | 'COMPLETED';

export interface ReviewItem {
  id: string;
  sourceTurnId: string;
  title: string;
  reason?: string | null;
  status: ReviewStatus;
  completedAt?: string | null;
  lastReviewedAt?: string | null;
  createdAt: string;
}

export interface ReviewAttempt {
  id: string;
  reviewItemId: string;
  answer: string;
  evaluation: InterviewEvaluation;
  citationIds: string[];
  score: string;
  createdAt: string;
}

export interface ReviewSourceTurn {
  id: string;
  sessionId: string;
  question: string;
  answer: string;
  evaluation?: InterviewEvaluation | null;
  citationIds: string[];
  createdAt: string;
}

export interface ReviewDetail {
  item: ReviewItem;
  sourceTurn: ReviewSourceTurn | null;
  sourceTopic: InterviewTopic | null;
  attempts: ReviewAttempt[];
}

export interface ReviewAnswerResult {
  attempt: ReviewAttempt;
  item: ReviewItem;
  autoCompleted: boolean;
  score: number;
}

export interface ReviewItemsPage {
  items: ReviewItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InterviewAnswerResult {
  turn: InterviewTurn;
  evaluation: InterviewEvaluation;
  citations: string[];
  nextQuestion?: string | null;
  reviewItems: ReviewItem[];
  status: InterviewSession['status'];
}
