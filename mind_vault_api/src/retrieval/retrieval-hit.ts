import { DocumentLocator } from '../document/parser/parsed-document';

export type RetrievalSource = 'keyword' | 'vector' | 'graph';

/** 高亮分段：服务端切分，前端按分段渲染，不返回 HTML */
export interface HighlightSegment {
  text: string;
  hit: boolean;
}

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  text: string;
  parentContext: string;
  locator: DocumentLocator;
  titlePath: string[];
  /** 命中所属资料集（ES 索引字段，用于展示与过滤回显） */
  datasetIds: string[];
  /** 仅关键字检索命中时返回；未命中为 null */
  highlight?: HighlightSegment[] | null;
  /** ES 索引时间，用于「按时间排序 / 时间范围」展示 */
  updatedAt?: string;
  score: number;
  sources: RetrievalSource[];
}

/** 单路检索的分页结果 */
export interface RetrievalPage {
  hits: RetrievalHit[];
  /** 可达总数：keyword 为 ES total；vector 为本次 kNN 可达条数；graph 为回捞后总数 */
  total: number;
  /** 是否因底层上限（如 kNN 的 k=100）而被截断 */
  truncated: boolean;
}
