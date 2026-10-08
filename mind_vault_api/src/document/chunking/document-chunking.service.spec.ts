import { DocumentChunkingService } from './document-chunking.service';
import { ParsedDocument } from '../parser/parsed-document';

function documentOf(
  text: string,
  section: Partial<ParsedDocument['sections'][number]> = {},
): ParsedDocument {
  return {
    title: 'notes.md',
    format: 'md',
    rawText: text,
    assets: [],
    sections: [
      {
        sectionId: 'section_0001',
        titlePath: [],
        text,
        order: 0,
        locator: { lineStart: 1, lineEnd: 3 },
        ...section,
      },
    ],
    quality: {
      chars: 0,
      tables: 0,
      images: 0,
      warnings: [],
      suspectedScanned: false,
    },
  };
}

describe('DocumentChunkingService', () => {
  it('creates deterministic atomic chunks and keeps parent locator context', () => {
    const service = new DocumentChunkingService();
    const parsed = documentOf('第一段内容\n\n第二段内容', {
      heading: '系统设计',
      titlePath: ['系统设计'],
    });

    const first = service.chunk('user_1', 'doc_1', 1, parsed, {
      maxCharacters: 8,
      overlapCharacters: 2,
    });
    const second = service.chunk('user_1', 'doc_1', 1, parsed, {
      maxCharacters: 8,
      overlapCharacters: 2,
    });

    expect(first.length).toBeGreaterThan(1);
    expect(first.map((chunk) => chunk.chunkId)).toEqual(
      second.map((chunk) => chunk.chunkId),
    );
    expect(first[0]).toMatchObject({
      parentId: 'section_0001',
      titlePath: ['系统设计'],
      locator: { lineStart: 1, lineEnd: 3 },
      parentContext: '第一段内容\n\n第二段内容',
    });
  });

  it('keeps a markdown table intact instead of slicing it across chunks', () => {
    const service = new DocumentChunkingService();
    const table = [
      '| 名称 | 说明 |',
      '| --- | --- |',
      `| 消息队列 | ${'削峰填谷'.repeat(8)} |`,
      `| 缓存 | ${'降低回源'.repeat(8)} |`,
    ].join('\n');
    const parsed = documentOf(
      `${'前置说明。'.repeat(6)}\n\n${table}\n\n后置说明`,
      {
        titlePath: ['系统设计'],
      },
    );

    const chunks = service.chunk('user_1', 'doc_1', 1, parsed, {
      maxCharacters: 80,
      overlapCharacters: 0,
    });

    const tableChunk = chunks.find((chunk) => chunk.text.includes('| 名称 |'));
    expect(tableChunk).toBeDefined();
    // 整张表（含表头与最后一行）必须落在同一个 chunk 内
    expect(tableChunk?.text).toContain('| 缓存 |');
  });

  it('keeps a fenced code block intact even when it exceeds the limit', () => {
    const service = new DocumentChunkingService();
    const code = `\`\`\`ts\n${'const x = 1;\n'.repeat(40)}\`\`\``;
    const parsed = documentOf(`说明\n\n${code}\n\n结尾`, {
      titlePath: ['实现'],
    });

    const chunks = service.chunk('user_1', 'doc_1', 1, parsed, {
      maxCharacters: 60,
      overlapCharacters: 0,
    });

    const codeChunk = chunks.find((chunk) => chunk.text.includes('```ts'));
    expect(codeChunk?.text.trim().endsWith('```')).toBe(true);
    expect(codeChunk?.text).toContain('const x = 1;');
    expect(codeChunk?.text).not.toContain('说明');
    expect(codeChunk?.text).not.toContain('结尾');
  });

  it('splits a long paragraph at Chinese sentence boundaries', () => {
    const service = new DocumentChunkingService();
    const paragraph =
      '第一句话内容。第二句话内容。第三句话内容。第四句话内容。';
    const parsed = documentOf(paragraph, { titlePath: [] });

    const chunks = service.chunk('user_1', 'doc_1', 1, parsed, {
      maxCharacters: 12,
      overlapCharacters: 0,
    });

    expect(chunks.length).toBeGreaterThan(1);
    // 每块都以句末标点结束，不会把句子从中间切断
    for (const chunk of chunks) {
      expect(chunk.text.endsWith('。')).toBe(true);
    }
  });

  it('copies the section multi-level titlePath onto every chunk', () => {
    const service = new DocumentChunkingService();
    const parsed = documentOf('正文内容', {
      heading: '一致性',
      titlePath: ['系统设计', '分布式', '一致性'],
    });

    const [chunk] = service.chunk('user_1', 'doc_1', 1, parsed);
    expect(chunk.titlePath).toEqual(['系统设计', '分布式', '一致性']);
  });
});
