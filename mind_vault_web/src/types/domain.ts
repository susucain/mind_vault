export type DocumentStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'archived'
  | 'deleted';

export interface Document {
  id: string;
  title: string;
  status: DocumentStatus | number;
  summary?: string | null;
  tags?: string | null;
  remark?: string | null;
  sourceFileName?: string | null;
  sourceFileSize?: string | null;
  sourceFileExtension?: string | null;
  wordCount?: number;
  viewCount?: number;
  ingestionStage?: string | null;
  ingestionStatus?: string | null;
  ingestionErrorMessage?: string | null;
  ingestionProgress?: {
    completed: number;
    total: number;
    percent: number;
    estimatedRemainingSeconds?: number | null;
  } | null;
  content?: string;
  sections?: DocumentSection[];
  pageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentLocator {
  page?: number;
  slide?: number;
  sheet?: string;
  cellRange?: string;
  lineStart?: number;
  lineEnd?: number;
  jsonPath?: string;
}

export interface DocumentSection {
  sectionId?: string;
  heading?: string;
  content?: string;
  order?: number;
  locator: DocumentLocator;
}

export interface Citation {
  id: string;
  documentId: string;
  documentName: string;
  excerpt: string;
  locator: DocumentLocator;
}

export interface Conversation {
  id: string;
  title: string;
  datasetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  citations: Citation[];
  createdAt: string;
}

export type InterviewSessionStatus = 'created' | 'active' | 'completed' | 'abandoned';

export interface InterviewSession {
  id: string;
  datasetId: string;
  title?: string;
  topic?: string;
  status: InterviewSessionStatus | string;
  questionCount?: number;
  answeredCount?: number;
  currentIndex?: number;
  totalQuestions?: number;
  currentQuestion?: string | null;
  createdAt: string;
  completedAt?: string;
}

export interface ReviewItem {
  id: string;
  sourceTurnId: string;
  title: string;
  reason?: string | null;
  status: 'PENDING' | 'COMPLETED';
  dueAt?: string | null;
  completedAt?: string | null;
  lastReviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string | null;
  documentCount?: number;
  createdAt: string;
  updatedAt: string;
}
