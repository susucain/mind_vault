import JSZip from 'jszip';
import { parseOffice } from 'officeparser';
import { cleanMarkdown, toMarkdownTable } from '../utils/markdown.util';

export interface ParsePptxResult {
  /** 幻灯片正文（不含备注），用于 section 切分与正文展示 */
  body: string;
  /** 讲者备注（A6），按幻灯片顺序，仅含非空备注 */
  notes: Array<{ slide: number; text: string }>;
  /** 降级类警告（如备注缺失），供 quality.warnings 使用 */
  warnings: string[];
}

/**
 * 将 PPTX 解析为 Markdown。
 *
 * 优先走自研 ZIP/XML 路径（按幻灯片输出 `## 幻灯片 N` + 标题/正文/表格 + 讲者备注）；
 * 解压或提取失败时降级到 officeparser AST → md（该路径不抽取备注）。
 */
export async function parsePptx(buffer: Buffer): Promise<ParsePptxResult> {
  try {
    return await parsePptxWithZip(buffer);
  } catch {
    return parsePptxWithOfficeParser(buffer);
  }
}

/** 降级路径：officeparser 统一转 Markdown（不含备注） */
async function parsePptxWithOfficeParser(
  buffer: Buffer,
): Promise<ParsePptxResult> {
  const ast = await parseOffice(buffer, { fileType: 'pptx' });
  const { value } = await ast.to('md');
  return {
    body: cleanMarkdown(value ?? ''),
    notes: [],
    warnings: [],
  };
}

/**
 * 自研路径：解压 PPTX（OOXML），按 slideN.xml 顺序提取。
 *
 * 单页结构：
 * 1. `## 幻灯片 N`
 * 2. 表格（Markdown table）
 * 3. title / ctrTitle 占位符 → `### 标题`
 * 4. 其余段落正文（已出现在标题中的文本跳过，避免重复）
 * 5. 讲者备注（A6）单独返回，由上层挂在该幻灯片之后并标 `locator.note`
 *
 * 提取表格后会从 XML 中剔除 `<a:tbl>`，防止单元格文字再出现在正文里。
 */
async function parsePptxWithZip(buffer: Buffer): Promise<ParsePptxResult> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (slidePaths.length === 0) {
    throw new Error('未找到 PPTX slide');
  }

  const parts: string[] = [];
  const notes: Array<{ slide: number; text: string }> = [];
  const warnings: string[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const slide = i + 1;
    const xml = await zip.file(slidePaths[i])!.async('string');
    parts.push(`## 幻灯片 ${slide}\n`);

    const tables = extractTables(xml);
    for (const table of tables) {
      parts.push(toMarkdownTable(table));
    }

    // 去掉表格区域，避免单元格文本在正文中重复出现
    const bodyXml = xml.replace(/<a:tbl[\s\S]*?<\/a:tbl>/g, '');

    const titleTexts = extractPlaceholderTexts(bodyXml, /ctrTitle|title/i);
    const bodyParagraphs = extractParagraphTexts(bodyXml);

    const used = new Set(titleTexts.map((t) => t.trim()).filter(Boolean));
    for (const t of titleTexts) {
      const text = t.trim();
      if (text) parts.push(`### ${text}\n`);
    }

    const bodyLines: string[] = [];
    for (const t of bodyParagraphs) {
      const text = t.trim();
      if (!text || used.has(text)) continue;
      bodyLines.push(text);
    }
    if (bodyLines.length > 0) {
      parts.push(`${bodyLines.join('\n')}\n\n`);
    }

    // A6：按 rels 关系取该幻灯片的 notesSlide，作为备注返回
    try {
      const note = await extractSlideNote(zip, slidePaths[i]);
      if (note) notes.push({ slide, text: note });
    } catch {
      warnings.push(`第 ${slide} 页备注提取失败`);
    }
  }

  const body = cleanMarkdown(parts.join('\n'));
  if (!body) {
    throw new Error('PPTX 提取结果为空');
  }
  return { body, notes, warnings };
}

/**
 * 讲者备注（A6）：顺着 `ppt/slides/_rels/slideN.xml.rels` 的 notesSlide 关系定位
 * `notesSlideM.xml`，优先取 body 占位符文本，缺失时退回全部段落。
 */
async function extractSlideNote(
  zip: JSZip,
  slidePath: string,
): Promise<string> {
  const relsPath = slidePath.replace(/(slide\d+\.xml)$/i, '_rels/$1.rels');
  const rels = await zip.file(relsPath)?.async('string');
  if (!rels) return '';

  const relationship = rels.match(
    /<Relationship\b[^>]*Type="[^"]*notesSlide"[^>]*>/i,
  )?.[0];
  const target = relationship?.match(/\bTarget="([^"]+)"/i)?.[1];
  if (!target) return '';

  const xml = await zip
    .file(resolvePartPath('ppt/slides', target))
    ?.async('string');
  if (!xml) return '';

  const body = extractPlaceholderTexts(xml, /body/i).join('\n').trim();
  return body || extractParagraphTexts(xml).join('\n').trim();
}

/** 解析 OOXML 部件相对路径（如 `../notesSlides/notesSlide1.xml`） */
function resolvePartPath(base: string, target: string): string {
  const segments = `${base}/${target}`.split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join('/');
}

/** 从路径 `ppt/slides/slide12.xml` 解析页码，供排序 */
function slideNumber(path: string): number {
  const m = path.match(/slide(\d+)\.xml$/i);
  return m ? Number(m[1]) : 0;
}

/**
 * 按段落提取文本：同一 `<a:p>` 内的多个 `<a:t>` run 合并，
 * `<a:br/>` 转为换行。
 */
function extractParagraphTexts(xml: string): string[] {
  const paragraphs: string[] = [];
  const pBlocks = xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? [];
  for (const p of pBlocks) {
    const text = extractRunsText(p);
    if (text.trim()) paragraphs.push(text);
  }
  return paragraphs;
}

/**
 * 从指定占位符类型的 shape 中提取文本（按段落合并）。
 * typePattern 通常匹配 title / ctrTitle。
 */
function extractPlaceholderTexts(xml: string, typePattern: RegExp): string[] {
  const texts: string[] = [];
  // 按 shape 切开，再看 `<p:ph type="...">`
  const shapes = xml.split(/<p:sp[\s>]/).slice(1);
  for (const shape of shapes) {
    const ph = shape.match(/<p:ph[^>]*\btype="([^"]+)"/i);
    if (!ph || !typePattern.test(ph[1])) continue;
    const paras = extractParagraphTexts(shape);
    const joined = paras.join('\n').trim();
    if (joined) texts.push(joined);
  }
  return texts;
}

/** 从 slide XML 中提取所有 `<a:tbl>`，归一为 string[][][]（多表 → 行 → 单元格） */
function extractTables(xml: string): string[][][] {
  const tables: string[][][] = [];
  const tableBlocks = xml.match(/<a:tbl[\s\S]*?<\/a:tbl>/g) ?? [];

  for (const block of tableBlocks) {
    const rows: string[][] = [];
    const trBlocks = block.match(/<a:tr[\s\S]*?<\/a:tr>/g) ?? [];
    for (const tr of trBlocks) {
      const cells: string[] = [];
      const tcBlocks = tr.match(/<a:tc[\s\S]*?<\/a:tc>/g) ?? [];
      for (const tc of tcBlocks) {
        // 单元格内多段落用空格拼成一格
        const cellParas = extractParagraphTexts(tc);
        cells.push(cellParas.join(' ').trim());
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }

  return tables;
}

/** 收集块内文本 run，并把显式换行 `<a:br/>` 转为 `\n` */
function extractRunsText(xml: string): string {
  let result = '';
  const re = /<a:br\s*\/>|<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].startsWith('<a:br')) {
      result += '\n';
    } else {
      result += decodeXml(m[1]);
    }
  }
  return result;
}

/** OOXML 文本实体反转义 */
function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
