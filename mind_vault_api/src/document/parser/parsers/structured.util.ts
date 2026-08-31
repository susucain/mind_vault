import { DocumentLocator, ParsedSection } from '../parsed-document';

export function sectionsFromMarkdown(
  text: string,
  locatorFactory: (
    index: number,
    heading?: string,
    lineStart?: number,
  ) => DocumentLocator = (_index, _heading, lineStart) => ({
    lineStart,
  }),
): ParsedSection[] {
  const lines = text.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let current: { heading?: string; lines: string[]; start: number } | undefined;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (!body && !current.heading) return;
    const index = sections.length;
    sections.push({
      sectionId: `section_${String(index + 1).padStart(4, '0')}`,
      heading: current.heading,
      text: [current.heading, body].filter(Boolean).join('\n'),
      order: index,
      locator: locatorFactory(index, current.heading, current.start),
    });
  };

  lines.forEach((line, index) => {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1];
    if (heading) {
      flush();
      current = { heading, lines: [], start: index + 1 };
      return;
    }
    if (!current) current = { lines: [], start: index + 1 };
    current.lines.push(line);
  });
  flush();

  if (sections.length === 0 && text.trim()) {
    sections.push({
      sectionId: 'section_0001',
      text: text.trim(),
      order: 0,
      locator: locatorFactory(0, undefined, 1),
    });
  }
  return sections;
}
