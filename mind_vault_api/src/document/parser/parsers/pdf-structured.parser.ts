import { PDFParse } from 'pdf-parse';
import { ParsedDocument } from '../parsed-document';

export async function parsePdfSections(
  buffer: Buffer,
  title = 'document.pdf',
): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const pages = result.pages ?? [];
    const sections = pages
      .map((page, index) => ({
        sectionId: `section_${String(index + 1).padStart(4, '0')}`,
        heading: `第 ${page.num ?? index + 1} 页`,
        text: (page.text ?? '').trim(),
        order: index,
        locator: { page: page.num ?? index + 1 },
      }))
      .filter((section) => section.text);
    return {
      title,
      format: 'pdf',
      pageCount: pages.length,
      sections,
      assets: [],
      rawText: sections.map((section) => section.text).join('\n\n'),
    };
  } finally {
    await parser.destroy();
  }
}
