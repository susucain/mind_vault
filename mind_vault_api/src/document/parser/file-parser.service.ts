import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RustfsService } from '../../storage/rustfs.service';
import { parseDocx } from './parsers/docx.parser';
import {
  ParsePdfOptions,
  parsePdfDocument,
  ImageUploader,
} from './parsers/pdf.parser';
import { parsePlainText } from './parsers/plain-text.parser';
import { parsePptx } from './parsers/pptx.parser';
import { parseXlsx } from './parsers/xlsx.parser';
import { getExtension, cleanMarkdown } from './utils/markdown.util';
import {
  buildQuality,
  ParsedDocument,
  ParseQuality,
  ParseError,
} from './parsed-document';
import { sectionsFromMarkdown } from './parsers/structured.util';
import { parseCsv } from './parsers/csv.parser';
import { parseJson } from './parsers/json.parser';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const execFileAsync = promisify(execFile);

/** 不依赖本机外部程序的格式 */
const MODERN_EXTENSIONS = [
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'txt',
  'md',
  'csv',
  'json',
];
/** 老版 Office 格式，需本机 `soffice`（LibreOffice）转换后才能解析 */
const LEGACY_EXTENSIONS = ['doc', 'xls', 'ppt'];
/** 已知的全部扩展名（用于解析分发，不等同于「当前可用」） */
const KNOWN_EXTENSIONS = new Set([...MODERN_EXTENSIONS, ...LEGACY_EXTENSIONS]);
const SOFFICE_PROBE_TIMEOUT_MS = 5_000;
/** 扫件判定默认阈值：PDF 平均每页字符低于该值即视为疑似扫描件 */
const DEFAULT_MIN_CHARS_PER_PAGE = 100;

/** 资产 MIME → 扩展名（key 以内容哈希命名，扩展名仅按真实类型决定） */
const ASSET_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export interface ParseInput {
  originalname: string;
  buffer: Buffer;
  size?: number;
  /** 资产隔离（A1）所需的归属信息：图片资产 key 以 owner/document 前缀写入 */
  ownerId?: string;
  documentId?: string;
}

/**
 * 文件 → Markdown 解析服务。
 *
 * 按扩展名分发到各 parser；所有格式先生成 ParsedDocument。
 * 解析结果为空或格式不支持时抛 BadRequestException。
 */
@Injectable()
export class FileParserService implements OnModuleInit {
  private readonly logger = new Logger(FileParserService.name);
  /** 本机是否存在可用的 soffice；不能在启动时确认则视为不可用（宁可早拒，不可排队后失败） */
  private sofficeAvailable = false;
  /** 扫件判定阈值（A2）：PDF 平均每页字符低于该值即视为疑似扫描件 */
  private readonly minCharsPerPage: number;

  constructor(
    private readonly rustfs: RustfsService,
    config: ConfigService,
  ) {
    this.minCharsPerPage =
      config.get<number>('parsing.minCharsPerPage') ??
      DEFAULT_MIN_CHARS_PER_PAGE;
  }

  async onModuleInit(): Promise<void> {
    const bin = process.env.SOFFICE_BIN ?? 'soffice';
    try {
      await execFileAsync(bin, ['--version'], {
        timeout: SOFFICE_PROBE_TIMEOUT_MS,
      });
      this.sofficeAvailable = true;
    } catch {
      this.sofficeAvailable = false;
      this.logger.warn(
        `未检测到 LibreOffice（${bin}），.doc/.xls/.ppt 将不可用`,
      );
    }
  }

  /** 当前实际可解析的扩展名（老格式取决于 soffice 是否可用），三端格式清单的唯一来源 */
  availableExtensions(): string[] {
    return this.sofficeAvailable
      ? [...MODERN_EXTENSIONS, ...LEGACY_EXTENSIONS]
      : [...MODERN_EXTENSIONS];
  }

  /** 是否为已支持的扩展名（大小写不敏感） */
  isSupported(extension: string): boolean {
    return KNOWN_EXTENSIONS.has(extension?.toLowerCase());
  }

  /** 逗号分隔的可用格式列表，用于错误提示 */
  supportedList(): string {
    return this.availableExtensions().join(', ');
  }

  /**
   * 将上传文件解析为 Markdown 字符串。
   * 与 parseStructured 共用同一份提取结果，避免不同入口产生不一致内容。
   */
  async parse(file: ParseInput): Promise<string> {
    const start = Date.now();
    const parsed = await this.parseStructured(file);
    const extension = getExtension(file.originalname);
    const result = parsed.rawText;

    const elapsed = Date.now() - start;
    this.logger.log(
      `文件解析完成: name=${file.originalname}, format=${extension}, chars=${result.length}, elapsed=${elapsed}ms`,
    );

    if (!result?.trim()) {
      throw new BadRequestException(
        '文件解析结果为空，请确认文件包含可提取的文本内容',
      );
    }

    return result;
  }

  async parseStructured(file: ParseInput): Promise<ParsedDocument> {
    const extension = getExtension(file.originalname);
    if (!this.isSupported(extension)) {
      throw new BadRequestException(
        `不支持的文件格式: ${extension || '(无扩展名)'}`,
      );
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('文件内容为空，无法解析');
    }
    // A8：老格式依赖本机 soffice，不可用时给出可分类的失败原因，而不是排队后报「转换失败」
    if (LEGACY_EXTENSIONS.includes(extension) && !this.sofficeAvailable) {
      throw new ParseError(
        'PARSE_LEGACY_UNAVAILABLE',
        `旧版 Office 格式（.${extension}）需服务端安装 LibreOffice，当前不可用`,
      );
    }

    let parsed: ParsedDocument;
    switch (extension) {
      case 'pdf':
        parsed = await parsePdfDocument(
          file.buffer,
          file.originalname,
          this.pdfOptions(file.ownerId, file.documentId),
        );
        break;
      case 'csv':
        parsed = parseCsv(file.buffer, file.originalname);
        break;
      case 'json':
        parsed = parseJson(file.buffer, file.originalname);
        break;
      case 'txt':
      case 'md':
        parsed = this.markdownDocument(
          file.originalname,
          extension,
          parsePlainText(file.buffer),
        );
        break;
      case 'docx':
        parsed = await this.docxDocument(file, extension, file.buffer);
        break;
      case 'doc':
        parsed = await this.docxDocument(
          file,
          extension,
          await this.convertLegacyOffice(file, 'docx'),
        );
        break;
      case 'pptx':
        parsed = await this.pptxDocument(file, extension, file.buffer);
        break;
      case 'ppt':
        parsed = await this.pptxDocument(
          file,
          extension,
          await this.convertLegacyOffice(file, 'pptx'),
        );
        break;
      case 'xlsx':
        parsed = this.markdownDocument(
          file.originalname,
          extension,
          await this.parseXlsxWithFallback(file.buffer),
        );
        break;
      case 'xls':
        parsed = this.markdownDocument(
          file.originalname,
          extension,
          await this.parseXlsxWithFallback(
            await this.convertLegacyOffice(file, 'xlsx'),
          ),
        );
        break;
      default:
        throw new BadRequestException(`不支持的文件格式: ${extension}`);
    }
    parsed.quality = this.finalizeQuality(parsed);
    if (!parsed.rawText.trim()) {
      if (parsed.quality.suspectedScanned) {
        throw new ParseError(
          'PARSE_SUSPECTED_SCANNED',
          '疑似扫描件，暂不支持文字提取',
        );
      }
      throw new ParseError(
        'PARSE_EMPTY',
        '文件解析结果为空，请确认文件包含可提取的文本内容',
      );
    }
    return parsed;
  }

  /**
   * 回填解析质量（A2）：字符数、页数由这里统一计算，避免各 parser 口径不一；
   * 扫件判定依赖 `minCharsPerPage` 阈值，故也集中在此。
   */
  private finalizeQuality(parsed: ParsedDocument): ParseQuality {
    const chars = parsed.rawText.trim().length;
    const pages = parsed.pageCount;
    const suspectedScanned =
      parsed.format === 'pdf' &&
      pages !== undefined &&
      pages > 0 &&
      chars / pages < this.minCharsPerPage &&
      (parsed.quality.images > 0 || pages >= 2);
    return { ...parsed.quality, chars, pages, suspectedScanned };
  }

  /**
   * DOCX（含 soffice 转换后的 .doc）→ ParsedDocument（A5）：
   * 内嵌图片走 A1 资产通道，mammoth messages 计入 quality.warnings。
   */
  private async docxDocument(
    file: ParseInput,
    format: string,
    buffer: Buffer,
  ): Promise<ParsedDocument> {
    const result = await parseDocx(buffer, {
      uploadImage: this.imageUploader(file.ownerId, file.documentId),
    });
    return this.markdownDocument(file.originalname, format, result.markdown, {
      assets: result.assets,
      quality: { images: result.images, warnings: result.warnings },
    });
  }

  /**
   * PPTX（含 soffice 转换后的 .ppt）→ ParsedDocument（A6）：
   * 讲者备注作为独立 section，以 `> 备注：` 引用块挂在对应幻灯片之后。
   */
  private async pptxDocument(
    file: ParseInput,
    format: string,
    buffer: Buffer,
  ): Promise<ParsedDocument> {
    const result = await parsePptx(buffer);
    return this.markdownDocument(file.originalname, format, result.body, {
      quality: { warnings: result.warnings },
      notes: result.notes,
    });
  }

  private markdownDocument(
    title: string,
    format: string,
    rawText: string,
    extras: {
      /** 解析期间登记的图片资产（A5） */
      assets?: ParsedDocument['assets'];
      /** parser 侧已知的质量信号（tables/images/warnings），chars/pages 由 finalizeQuality 回填 */
      quality?: Partial<ParseQuality>;
      /** PPTX 讲者备注（A6）：独立 section 并标 locator.note */
      notes?: Array<{ slide: number; text: string }>;
    } = {},
  ): ParsedDocument {
    const sections = sectionsFromMarkdown(
      rawText,
      (index, heading, lineStart) =>
        format.startsWith('ppt')
          ? { slide: Number(heading?.match(/\d+/)?.[0] ?? index + 1) }
          : format.startsWith('xls')
            ? { sheet: heading }
            : { lineStart },
    );

    // A6：备注单独成段，既不与正文 section 重复，又能通过 locator.note 区分
    const noteTexts: string[] = [];
    for (const note of extras.notes ?? []) {
      const heading = `第 ${note.slide} 页备注`;
      const text = `## ${heading}\n\n> 备注：${note.text}`;
      noteTexts.push(text);
      sections.push({
        sectionId: `section_${String(sections.length + 1).padStart(4, '0')}`,
        heading,
        titlePath: [heading],
        text,
        order: sections.length,
        locator: { slide: note.slide, note: true },
      });
    }

    return {
      title,
      format,
      sections,
      assets: extras.assets ?? [],
      rawText: cleanMarkdown(
        [rawText, ...noteTexts].filter(Boolean).join('\n\n'),
      ),
      quality: buildQuality({ chars: rawText.length, ...extras.quality }),
    };
  }

  /**
   * 图片资产通道（A1）：key 规则 `documents/{ownerId}/{documentId}/{sha256前16位}.{ext}`。
   * 内容哈希命名使同图天然幂等，且规避了 OSS 对中文/空格/非法字符的限制。
   * 缺少归属信息时禁用图片上传，绝不退回到无 owner 段的全局 key。
   */
  private imageUploader(
    ownerId?: string,
    documentId?: string,
  ): ImageUploader | undefined {
    if (!this.rustfs.isEnabled() || !ownerId || !documentId) return undefined;
    return (bytes, _fileName, contentType) =>
      this.rustfs.uploadBytes(bytes, {
        key: assetObjectKey(ownerId, documentId, bytes, contentType),
        contentType,
      });
  }

  private pdfOptions(ownerId?: string, documentId?: string): ParsePdfOptions {
    return { uploadImage: this.imageUploader(ownerId, documentId) };
  }

  /**
   * XLSX：exceljs 优先（结构化表格 Markdown）；
   * 失败时降级 officeparser AST → md，保证兼容异常/损坏文件。
   */
  private async parseXlsxWithFallback(buffer: Buffer): Promise<string> {
    try {
      const start = Date.now();
      const result = await parseXlsx(buffer);
      this.logger.log(
        `XLSX(exceljs) 解析成功: chars=${result.length}, elapsed=${Date.now() - start}ms`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`XLSX(exceljs) 解析失败，降级 officeparser: ${message}`);
      const { parseOffice } = await import('officeparser');
      const ast = await parseOffice(buffer, { fileType: 'xlsx' });
      const { value } = await ast.to('md');
      return value ?? '';
    }
  }

  /**
   * 老格式（.doc/.xls/.ppt）先用 soffice 转成现代格式，再交给对应 parser。
   * 只负责转换，解析仍走 docx/pptx/xlsx 各自入口，避免绕开 A5/A6 的资产与备注处理。
   */
  private async convertLegacyOffice(
    file: ParseInput,
    targetExtension: 'docx' | 'xlsx' | 'pptx',
  ): Promise<Buffer> {
    const directory = await mkdtemp(join(tmpdir(), 'mind-vault-office-'));
    const sourceName = basename(file.originalname);
    const sourcePath = join(directory, sourceName);
    const targetName = `${sourceName.replace(/\.[^.]+$/, '')}.${targetExtension}`;
    const targetPath = join(directory, targetName);

    try {
      await writeFile(sourcePath, file.buffer);
      await execFileAsync(process.env.SOFFICE_BIN ?? 'soffice', [
        '--headless',
        '--convert-to',
        targetExtension,
        '--outdir',
        directory,
        sourcePath,
      ]);
      return await readFile(targetPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `旧版 Office 文件转换失败，请确认已安装 LibreOffice: ${message}`,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

/**
 * 资产对象 key（A1）：`documents/{ownerId}/{documentId}/{sha256前16位}.{ext}`。
 * 用内容指纹而非时间戳/页码，保证同图同 key（幂等）且不产生垃圾对象。
 */
function assetObjectKey(
  ownerId: string,
  documentId: string,
  bytes: Buffer,
  contentType: string,
): string {
  const ext = ASSET_EXTENSIONS[contentType] ?? 'png';
  const fingerprint = createHash('sha256')
    .update(bytes)
    .digest('hex')
    .slice(0, 16);
  return `documents/${ownerId}/${documentId}/${fingerprint}.${ext}`;
}
