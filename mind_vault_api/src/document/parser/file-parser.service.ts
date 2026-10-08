import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { RustfsService } from '../../storage/rustfs.service';
import { parseDocx } from './parsers/docx.parser';
import { ParsePdfOptions, parsePdfDocument } from './parsers/pdf.parser';
import { parsePlainText } from './parsers/plain-text.parser';
import { parsePptx } from './parsers/pptx.parser';
import { parseXlsx } from './parsers/xlsx.parser';
import { getExtension } from './utils/markdown.util';
import { ParsedDocument } from './parsed-document';
import { sectionsFromMarkdown } from './parsers/structured.util';
import { parseCsv } from './parsers/csv.parser';
import { parseJson } from './parsers/json.parser';
import { execFile } from 'node:child_process';
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

export interface ParseInput {
  originalname: string;
  buffer: Buffer;
  size?: number;
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

  constructor(private readonly rustfs: RustfsService) {}

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

    let parsed: ParsedDocument;
    switch (extension) {
      case 'pdf':
        parsed = await parsePdfDocument(
          file.buffer,
          file.originalname,
          this.pdfOptions(),
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
        parsed = this.markdownDocument(
          file.originalname,
          extension,
          await parseDocx(file.buffer),
        );
        break;
      case 'doc':
        parsed = this.markdownDocument(
          file.originalname,
          extension,
          await this.parseLegacyOffice(file, 'docx'),
        );
        break;
      case 'pptx':
        parsed = this.markdownDocument(
          file.originalname,
          extension,
          await parsePptx(file.buffer),
        );
        break;
      case 'ppt':
        parsed = this.markdownDocument(
          file.originalname,
          extension,
          await this.parseLegacyOffice(file, 'pptx'),
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
          await this.parseLegacyOffice(file, 'xlsx'),
        );
        break;
      default:
        throw new BadRequestException(`不支持的文件格式: ${extension}`);
    }
    if (!parsed.rawText.trim()) {
      throw new BadRequestException('文件解析结果为空');
    }
    return parsed;
  }

  private markdownDocument(
    title: string,
    format: string,
    rawText: string,
  ): ParsedDocument {
    return {
      title,
      format,
      sections: sectionsFromMarkdown(rawText, (index, heading, lineStart) =>
        format.startsWith('ppt')
          ? { slide: Number(heading?.match(/\d+/)?.[0] ?? index + 1) }
          : format.startsWith('xls')
            ? { sheet: heading }
            : { lineStart },
      ),
      assets: [],
      rawText,
    };
  }

  private pdfOptions(): ParsePdfOptions {
    return {
      uploadImage: this.rustfs.isEnabled()
        ? (bytes, fileName, contentType) =>
            this.rustfs.uploadBytes(bytes, {
              fileName,
              contentType,
              prefix: 'pdf-images',
            })
        : undefined,
    };
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

  private async parseLegacyOffice(
    file: ParseInput,
    targetExtension: 'docx' | 'xlsx' | 'pptx',
  ): Promise<string> {
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
      const converted = await readFile(targetPath);
      if (targetExtension === 'docx') return parseDocx(converted);
      if (targetExtension === 'xlsx')
        return this.parseXlsxWithFallback(converted);
      return parsePptx(converted);
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
