import { FileParserService } from './file-parser.service';

describe('FileParserService', () => {
  const service = new FileParserService({
    isEnabled: () => false,
  } as never);

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
});
