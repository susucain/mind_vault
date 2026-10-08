export type DocumentStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'archived'
  | 'deleted';

export interface DocumentGraphProgress {
  status: 'NOT_STARTED' | 'PROCESSING' | 'READY' | 'FAILED';
  completed: number;
  total: number;
  failed: number;
  estimatedRemainingSeconds?: number | null;
}

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
  /** 是否已开启图谱构建（默认关闭）；未返回时视为不可判定 */
  graphEnabled?: boolean;
  /** 图谱构建进度，未开启时为 null */
  graph?: DocumentGraphProgress | null;
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
  /** 来源分块：回答相关图谱按这批 chunk 取实体关系 */
  chunkId: string;
  excerpt: string;
  locator: DocumentLocator;
  /** 命中关键字分段；语义路径与存量数据为 null，此时按 excerpt 原样渲染 */
  highlight?: HighlightSegment[] | null;
  /**
   * 该引用的 chunkId 已随文档重建失效（§11.3）。
   * 为真时不再展示片段正文，降级为「文档名 + locator + 片段已更新」。
   */
  stale?: boolean;
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
  /** 追问推荐（仅助手消息）：本轮回答后生成，空数组表示回落到静态通用引导 */
  suggestions?: string[];
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
  /** 被归一合并的原始写法（G2 展示层），如「Elasticsearch (ES)」 */
  aliases?: string[];
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
