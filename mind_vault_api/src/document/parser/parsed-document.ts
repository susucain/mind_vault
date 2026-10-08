export interface DocumentLocator {
  page?: number;
  slide?: number;
  sheet?: string;
  cellRange?: string;
  lineStart?: number;
  lineEnd?: number;
  jsonPath?: string;
  /** PPTX 讲者备注（A6）：true 表示该 section 来自备注而非幻灯片正文 */
  note?: boolean;
}

export interface ParsedSection {
  sectionId: string;
  heading?: string;
  /**
   * 标题层级路径（A7）：从顶层标题到当前标题的完整链路。
   * 单层标题时是 `[heading]`，无标题时为空数组；分块侧据此生成多级 `titlePath`。
   */
  titlePath: string[];
  text: string;
  order: number;
  locator: DocumentLocator;
}

/**
 * 解析质量信号（A2）：供失败归因、降级提示与第 10 章指标使用。
 * `chars`/`pages` 由 FileParserService 在解析结束后统一回填，
 * 各 parser 只需提供自己知道的部分（tables/images/warnings）。
 */
export interface ParseQuality {
  /** 提取到的正文字符数（去首尾空白） */
  chars: number;
  /** 页数（仅分页格式提供） */
  pages?: number;
  /** 检出的表格数量 */
  tables: number;
  /** 提取到的图片数量 */
  images: number;
  /** 降级/跳过类警告（如图片上传失败、格式回退） */
  warnings: string[];
  /** 疑似扫描件：PDF 且平均每页字符过少且（有图或多页） */
  suspectedScanned: boolean;
}

export function buildQuality(patch: Partial<ParseQuality> = {}): ParseQuality {
  return {
    chars: 0,
    tables: 0,
    images: 0,
    warnings: [],
    suspectedScanned: false,
    ...patch,
  };
}

export interface ParsedDocument {
  title: string;
  format: string;
  pageCount?: number;
  sections: ParsedSection[];
  assets: Array<{ url: string; locator?: DocumentLocator }>;
  rawText: string;
  quality: ParseQuality;
}

/** 解析错误分类（A2），用于填充 job.error_code 的失败归因 */
export type ParseErrorCode =
  | 'PARSE_EMPTY'
  | 'PARSE_SUSPECTED_SCANNED'
  | 'PARSE_LEGACY_UNAVAILABLE'
  | 'PARSE_FAILED';

/**
 * 可分类的解析错误：worker 据此把 `job.error_code` 填成具体原因，
 * 而不是笼统的 `PARSING_FAILED`。`message` 直接面向用户展示。
 */
export class ParseError extends Error {
  constructor(
    readonly code: ParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}
