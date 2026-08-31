import { DocumentLocator } from '../document/parser/parsed-document';

export type RetrievalSource = 'keyword' | 'vector' | 'graph';

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  text: string;
  parentContext: string;
  locator: DocumentLocator;
  titlePath: string[];
  score: number;
  sources: RetrievalSource[];
}
