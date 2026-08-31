import { DocumentLocator } from '../parser/parsed-document';

export interface DocumentChunk {
  chunkId: string;
  parentId: string;
  ownerId: string;
  documentId: string;
  datasetIds?: string[];
  documentVersion: number;
  sectionId: string;
  chunkOrder: number;
  titlePath: string[];
  text: string;
  parentContext: string;
  locator: DocumentLocator;
  embedding?: number[];
}
