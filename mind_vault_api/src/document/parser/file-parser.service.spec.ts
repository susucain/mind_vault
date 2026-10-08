jest.mock('./parsers/pdf.parser', () => ({
  parsePdfDocument: jest.fn(),
}));

jest.mock('./parsers/docx.parser', () => ({
  parseDocx: jest.fn(),
}));

jest.mock('./parsers/pptx.parser', () => ({
  parsePptx: jest.fn(),
}));

import { FileParserService } from './file-parser.service';
import { ParseError } from './parsed-document';
import { parseDocx } from './parsers/docx.parser';
import { parsePdfDocument } from './parsers/pdf.parser';
import { parsePptx } from './parsers/pptx.parser';

describe('FileParserService', () => {
  const service = new FileParserService(
    { isEnabled: () => false } as never,
    { get: () => undefined } as never,
  );

  it('supports all MVP file extensions case-insensitively', () => {
    for (const extension of [
      'pdf',
      'docx',
      'xlsx',
      'pptx',
      'txt',
      'md',
      'csv',
      'json',
    ]) {
      expect(service.isSupported(extension.toUpperCase())).toBe(true);
    }
  });

  it('exposes only modern Office formats', () => {
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
      titlePath: ['第一章'],
      locator: { lineStart: 1 },
    });
    // A7：二级标题的 titlePath 含祖先链，供分块侧生成多级路径
    expect(result.sections[1].titlePath).toEqual(['第一章', '小节']);
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
          titlePath: ['第 1 页'],
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

  it('rejects legacy Office formats', async () => {
    await expect(
      service.parseStructured({
        originalname: 'old.doc',
        buffer: Buffer.from('doc'),
      }),
    ).rejects.toThrow('不支持的文件格式');
  });

  it('registers DOCX images and warnings on the parsed document (A5)', async () => {
    const buffer = Buffer.from('docx');
    (parseDocx as jest.MockedFunction<typeof parseDocx>).mockResolvedValue({
      markdown: '# 标题\n\n正文',
      assets: [{ url: 'documents/user_1/doc_1/abc123.png' }],
      images: 2,
      warnings: ['未识别的样式：自定义标题'],
    });

    const result = await service.parseStructured({
      originalname: 'notes.docx',
      buffer,
    });

    expect(result.assets).toEqual([
      { url: 'documents/user_1/doc_1/abc123.png' },
    ]);
    expect(result.quality).toMatchObject({
      images: 2,
      warnings: ['未识别的样式：自定义标题'],
    });
    expect(parseDocx).toHaveBeenCalledWith(buffer, { uploadImage: undefined });
  });

  it('attaches PPTX speaker notes as a note-located section (A6)', async () => {
    (parsePptx as jest.MockedFunction<typeof parsePptx>).mockResolvedValue({
      body: '## 幻灯片 1\n\n### 架构总览\n\n正文要点',
      notes: [{ slide: 1, text: '记得补充容量估算' }],
      warnings: [],
    });

    const result = await service.parseStructured({
      originalname: 'deck.pptx',
      buffer: Buffer.from('pptx'),
    });

    const last = result.sections[result.sections.length - 1];
    expect(last).toMatchObject({
      heading: '第 1 页备注',
      text: '## 第 1 页备注\n\n> 备注：记得补充容量估算',
      locator: { slide: 1, note: true },
    });
    // 备注同时进入正文，供预览与检索使用
    expect(result.rawText).toContain('> 备注：记得补充容量估算');
  });
});
