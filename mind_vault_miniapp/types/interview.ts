export type InterviewMode =
  'quick_qa' | 'project_deep_dive' | 'technical' | 'behavioral';

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
  mode: InterviewMode;
  status: 'IN_PROGRESS' | 'COMPLETED';
  currentIndex: number;
  totalQuestions: number;
  currentQuestion?: string | null;
  createdAt: string;
  updatedAt: string;
  turns?: InterviewTurn[];
}

export interface ReviewItem {
  id: string;
  title: string;
  reason?: string | null;
  status: 'PENDING' | 'COMPLETED';
  createdAt: string;
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
