import { DocumentChunkingService } from './document-chunking.service';

describe('DocumentChunkingService', () => {
  it('creates deterministic atomic chunks and keeps parent locator context', () => {
    const service = new DocumentChunkingService();
    const parsed = {
      title: 'notes.md',
      format: 'md',
      rawText: '第一段内容\n\n第二段内容',
      assets: [],
      sections: [
        {
          sectionId: 'section_0001',
          heading: '系统设计',
          text: '第一段内容\n\n第二段内容',
          order: 0,
          locator: { lineStart: 1, lineEnd: 3 },
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
});
