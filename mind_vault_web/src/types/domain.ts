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
  datasetId?: string | null;
  datasetName?: string | null;
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

/** 文档大纲：仅章节元信息，不含正文（用于目录与深链定位）。 */
export interface DocumentOutline {
  documentId: string;
  title: string;
  pageCount: number;
  totalSections: number;
  sections: DocumentSection[];
}

/** 正文分页结果；`nextCursor` 为 null 表示已到底部。 */
export interface DocumentSectionPage {
  items: DocumentSection[];
  nextCursor: number | null;
  total: number;
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
  favorite: boolean;
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
  /** 该会话已评分题目的平均得分（后端聚合，未评分时为 null）。 */
  averageScore?: number | null;
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

/* ===== 统一检索 ===== */

export type RetrievalMode = 'keyword' | 'vector' | 'graph' | 'hybrid';
export type RetrievalSort = 'relevance' | 'recent';
export type RetrievalSource = 'keyword' | 'vector' | 'graph';
export type ScoreKind = 'normalized_bm25' | 'cosine_similarity' | 'graph_degree' | 'rrf_fusion';
export type EntityType = 'PERSON' | 'PROJECT' | 'TECHNOLOGY' | 'CONCEPT' | 'ORGANIZATION' | 'EVENT';
export type RelationType =
  | 'USES'
  | 'USED_FOR'
  | 'DEPENDS_ON'
  | 'CAUSES'
  | 'RELATED_TO'
  | 'PART_OF'
  | 'CREATED_BY'
  | 'MENTIONED_WITH';

/** 后端返回的高亮分段；前端据此渲染 React 节点，不经 innerHTML。 */
export interface HighlightSegment {
  text: string;
  hit: boolean;
}

export interface SearchResultItem {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  datasetIds: string[];
  datasetNames: string[];
  text: string;
  highlight: HighlightSegment[] | null;
  parentContext: string;
  locator: DocumentLocator;
  titlePath: string[];
  score: number;
  scoreKind: ScoreKind;
  sources: RetrievalSource[];
  updatedAt?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: EntityType;
  degree: number;
  isFocus?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  confidence?: number;
  sourceChunkId?: string;
}

export interface GraphView {
  focus: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface SearchHistoryFilters {
  sort: RetrievalSort;
  from: string | null;
  to: string | null;
  pageSize: number;
  maxHops: number;
}

/** 服务端返回的检索历史记录（按 ownerId 隔离，仅本人可见）。 */
export interface SearchHistoryEntry {
  id: string;
  mode: RetrievalMode;
  query: string;
  datasetIds: string[];
  entityNames: string[];
  filters: SearchHistoryFilters;
  resultCount: number;
  createdAt: string;
}
