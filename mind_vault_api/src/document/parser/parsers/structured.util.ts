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
  /** 标题层级栈（A7）：按 `#{1,6}` 层数维护，用于生成多级 titlePath */
  const stack: Array<{ level: number; text: string }> = [];
  let current:
    | { heading?: string; titlePath: string[]; lines: string[]; start: number }
    | undefined;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (!body && !current.heading) return;
    const index = sections.length;
    sections.push({
      sectionId: `section_${String(index + 1).padStart(4, '0')}`,
      heading: current.heading,
      titlePath: current.titlePath,
      text: [current.heading, body].filter(Boolean).join('\n'),
      order: index,
      locator: locatorFactory(index, current.heading, current.start),
    });
  };

  lines.forEach((line, index) => {
    const matched = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (matched) {
      flush();
      const level = matched[1].length;
      const heading = matched[2];
      // 同级或更低层级出栈：只保留当前标题的祖先链
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      stack.push({ level, text: heading });
      current = {
        heading,
        titlePath: stack.map((item) => item.text),
        lines: [],
        start: index + 1,
      };
      return;
    }
    if (!current) current = { titlePath: [], lines: [], start: index + 1 };
    current.lines.push(line);
  });
  flush();

  if (sections.length === 0 && text.trim()) {
    sections.push({
      sectionId: 'section_0001',
      titlePath: [],
      text: text.trim(),
      order: 0,
      locator: locatorFactory(0, undefined, 1),
    });
  }
  return sections;
}
