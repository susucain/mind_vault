export interface DocumentLocator {
  page?: number;
  slide?: number;
  sheet?: string;
  cellRange?: string;
  lineStart?: number;
  lineEnd?: number;
  jsonPath?: string;
}

export interface ParsedSection {
  sectionId: string;
  heading?: string;
  text: string;
  order: number;
  locator: DocumentLocator;
}

export interface ParsedDocument {
  title: string;
  format: string;
  pageCount?: number;
  sections: ParsedSection[];
  assets: Array<{ url: string; locator?: DocumentLocator }>;
  rawText: string;
}
