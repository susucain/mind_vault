jest.mock('./parsers/pdf.parser', () => ({
  parsePdfDocument: jest.fn(),
}));

import { FileParserService } from './file-parser.service';
import { ParseError } from './parsed-document';
import { parsePdfDocument } from './parsers/pdf.parser';

describe('FileParserService', () => {
  const service = new FileParserService(
    { isEnabled: () => false } as never,
    { get: () => undefined } as never,
  );

  it('supports all MVP file extensions case-insensitively', () => {
    for (const extension of [
      'pdf',
      'docx',
      'doc',
      'xlsx',
      'xls',
      'pptx',
      'ppt',
      'txt',
      'md',
      'csv',
      'json',
    ]) {
      expect(service.isSupported(extension.toUpperCase())).toBe(true);
    }
  });

  it('excludes legacy Office formats from the available list when soffice is unavailable', () => {
    // A8：未探测到 soffice 时，上传清单不含 .doc/.xls/.ppt，避免排队后才报转换失败
    expect(service.availableExtensions()).not.toEqual(
      expect.arrayContaining(['doc', 'xls', 'ppt']),
    );
    expect(service.supportedList().split(', ')).not.toContain('doc');
    expect(service.supportedList().split(', ')).toContain('docx');
  });

  it('parses markdown into structured sections with line locators', async () => {
    const result = await service.parseStructured({
      originalname: 'notes.md',
      buffer: Buffer.from('# 第一章\n\n消息队列\n\n## 小节\n重试策略'),
    });

    expect(result.format).toBe('md');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({
      heading: '第一章',
      locator: { lineStart: 1 },
    });
    expect(result.rawText).toContain('重试策略');
  });

  it('parses JSON into searchable JSONPath lines', async () => {
    const result = await service.parseStructured({
      originalname: 'data.json',
      buffer: Buffer.from('{"project":{"name":"Mind Vault"}}'),
    });

    expect(result.sections[0].locator.jsonPath).toBe('$');
    expect(result.rawText).toContain('$.project.name: Mind Vault');
  });

  it('parses CSV into a section with row locators', async () => {
    const result = await service.parseStructured({
      originalname: 'data.csv',
      buffer: Buffer.from('name,score\nMind Vault,100\n'),
    });

    expect(result.format).toBe('csv');
    expect(result.sections[0].locator).toMatchObject({
      lineStart: 1,
      lineEnd: 2,
    });
    expect(result.rawText).toContain('Mind Vault | 100');
  });

  it('uses the same PDF extraction result for structured and text parsing', async () => {
    const parsed = {
      title: 'guide.pdf',
      format: 'pdf',
      pageCount: 1,
      sections: [
        {
          sectionId: 'section_0001',
          text: 'PDF content',
          order: 0,
          locator: { page: 1 },
        },
      ],
      assets: [],
      rawText: 'PDF content',
      quality: {
        chars: 'PDF content'.length,
        pages: 1,
        tables: 0,
        images: 0,
        warnings: [],
        suspectedScanned: false,
      },
    };
    const parsePdfDocumentMock = parsePdfDocument as jest.MockedFunction<
      typeof parsePdfDocument
    >;
    parsePdfDocumentMock.mockResolvedValue(parsed);
    const file = {
      originalname: 'guide.pdf',
      buffer: Buffer.from('pdf'),
    };

    await expect(service.parseStructured(file)).resolves.toEqual(parsed);
    await expect(service.parse(file)).resolves.toBe('PDF content');

    expect(parsePdfDocumentMock).toHaveBeenCalledTimes(2);
    expect(parsePdfDocumentMock).toHaveBeenCalledWith(
      file.buffer,
      file.originalname,
      expect.objectContaining({ uploadImage: undefined }),
    );
  });

  it('returns CSV text from the same structured parser used for ingestion', async () => {
    await expect(
      service.parse({
        originalname: 'data.csv',
        buffer: Buffer.from('name,score\nMind Vault,100\n'),
      }),
    ).resolves.toContain('Mind Vault | 100');
  });

  it('reports parse quality with chars and table count', async () => {
    const result = await service.parseStructured({
      originalname: 'data.csv',
      buffer: Buffer.from('name,score\nMind Vault,100\n'),
    });

    expect(result.quality).toMatchObject({
      tables: 1,
      suspectedScanned: false,
    });
    expect(result.quality.chars).toBe(result.rawText.trim().length);
  });

  it('classifies empty extraction as PARSE_EMPTY', async () => {
    await expect(
      service.parseStructured({
        originalname: 'empty.json',
        buffer: Buffer.from('{}'),
      }),
    ).rejects.toMatchObject({ name: 'ParseError', code: 'PARSE_EMPTY' });
  });

  it('classifies suspected scanned PDFs as PARSE_SUSPECTED_SCANNED', async () => {
    (
      parsePdfDocument as jest.MockedFunction<typeof parsePdfDocument>
    ).mockResolvedValue({
      title: 'scan.pdf',
      format: 'pdf',
      pageCount: 3,
      sections: [],
      assets: [],
      rawText: '',
      quality: {
        chars: 0,
        pages: 3,
        tables: 0,
        images: 5,
        warnings: [],
        suspectedScanned: false,
      },
    });

    await expect(
      service.parseStructured({
        originalname: 'scan.pdf',
        buffer: Buffer.from('pdf'),
      }),
    ).rejects.toBeInstanceOf(ParseError);
    await expect(
      service.parseStructured({
        originalname: 'scan.pdf',
        buffer: Buffer.from('pdf'),
      }),
    ).rejects.toMatchObject({ code: 'PARSE_SUSPECTED_SCANNED' });
  });

  it('rejects legacy Office formats when soffice is unavailable', async () => {
    await expect(
      service.parseStructured({
        originalname: 'old.doc',
        buffer: Buffer.from('doc'),
      }),
    ).rejects.toMatchObject({ code: 'PARSE_LEGACY_UNAVAILABLE' });
  });
});
