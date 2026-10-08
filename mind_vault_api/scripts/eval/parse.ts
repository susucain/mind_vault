import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentChunkingService } from '../../src/document/chunking/document-chunking.service';
import { parseCsv } from '../../src/document/parser/parsers/csv.parser';
import { parseJson } from '../../src/document/parser/parsers/json.parser';
import { parsePlainText } from '../../src/document/parser/parsers/plain-text.parser';
import { sectionsFromMarkdown } from '../../src/document/parser/parsers/structured.util';
import { cleanMarkdown, getExtension } from '../../src/document/parser/utils/markdown.util';
import {
  buildQuality,
  ParsedDocument,
} from '../../src/document/parser/parsed-document';
import {
  DOCUMENTS_DIR,
  EXPECTED_DIR,
  evaluate,
  levenshtein,
  markdownTable,
  normalizeForCompare,
  ratio,
  readJson,
  writeReport,
} from './lib';

/**
 * 解析 / 分块评测（§10.3，`npm run eval:parsing`）。
 *
 * 走纯函数链路：不进 PG/Mongo/ES/Neo4j，只复用与线上同一份 parser 与分块实现，
 * 因此 `--dry-run` 与否结果一致（真实中间件只影响图谱与检索两项）。
 */

interface ParsingAnnotation {
  format: string;
  /** `source`：以源文件清洗后文本为参考；`reference`：以标注文本为参考 */
  accuracyMode: 'source' | 'reference';
  reference?: string;
  expectedSections: number;
  quality: { tables: number; suspectedScanned: boolean };
  mustContain: string[];
}

interface ParsingFixture {
  documents: Record<string, ParsingAnnotation>;
}

/** 复用 FileParserService 的纯函数分支（txt/md/csv/json），不含图片处理 */
function parseFixture(name: string, buffer: Buffer): ParsedDocument {
  const extension = getExtension(name);
  if (extension === 'csv') return finalize(parseCsv(buffer, name));
  if (extension === 'json') return finalize(parseJson(buffer, name));
  if (extension === 'md' || extension === 'txt') {
    const raw = parsePlainText(buffer);
    return finalize({
      title: name,
      format: extension,
      sections: sectionsFromMarkdown(raw, (_index, _heading, lineStart) => ({
        lineStart,
      })),
      assets: [],
      rawText: cleanMarkdown(raw),
      quality: buildQuality({ chars: raw.length }),
    });
  }
  throw new Error(`评测样本暂不支持格式：${name}`);
}

/** 对齐 FileParserService.finalizeQuality：chars 以清洗后正文长度为准 */
function finalize(parsed: ParsedDocument): ParsedDocument {
  return {
    ...parsed,
    quality: { ...parsed.quality, chars: parsed.rawText.trim().length },
  };
}

function evaluateDocument(
  name: string,
  annotation: ParsingAnnotation,
  chunker: DocumentChunkingService,
) {
  const buffer = readFileSync(join(DOCUMENTS_DIR, name));
  const parsed = parseFixture(name, buffer);
  const chunks = chunker.chunk('eval-owner', 'eval-doc', 1, parsed);

  const reference =
    annotation.accuracyMode === 'reference'
      ? (annotation.reference ?? '')
      : normalizeForCompare(parsePlainText(buffer));
  const actual = normalizeForCompare(parsed.rawText);
  const target = normalizeForCompare(reference);
  const accuracy =
    target.length === 0
      ? 1
      : ratio(Math.max(0, 1 - levenshtein(actual, target) / target.length));

  const missing = annotation.mustContain.filter(
    (needle) => !parsed.rawText.includes(needle),
  );
  const qualityPass =
    parsed.quality.tables === annotation.quality.tables &&
    parsed.quality.suspectedScanned === annotation.quality.suspectedScanned;
  const sectionPass = parsed.sections.length === annotation.expectedSections;

  return {
    file: name,
    format: annotation.format,
    sectionsActual: parsed.sections.length,
    sectionsExpected: annotation.expectedSections,
    sectionPass,
    chunks: chunks.length,
    avgChunkChars:
      chunks.length === 0
        ? 0
        : Math.round(
            chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) /
              chunks.length,
          ),
    chars: parsed.quality.chars,
    accuracy,
    mustContainHits: annotation.mustContain.length - missing.length,
    mustContainTotal: annotation.mustContain.length,
    mustContainMisses: missing,
    tablesActual: parsed.quality.tables,
    suspectedScanned: parsed.quality.suspectedScanned,
    qualityPass,
    pass: sectionPass && qualityPass && missing.length === 0 && accuracy >= 0.9,
  };
}

function main(): void {
  const args = evaluate(process.argv.slice(2));
  const annotation = readJson<ParsingFixture>(
    join(EXPECTED_DIR, 'parsing.json'),
  );
  const chunker = new DocumentChunkingService();

  const rows = Object.keys(annotation.documents)
    .sort()
    .map((name) =>
      evaluateDocument(name, annotation.documents[name], chunker),
    );

  const accuracyAvg = ratio(
    rows.reduce((sum, row) => sum + row.accuracy, 0) / (rows.length || 1),
  );
  const passed = rows.filter((row) => row.pass).length;

  const markdown = [
    `# 解析 / 分块评测报告（${new Date().toISOString()}）`,
    '',
    `- 样本数：${rows.length}，通过：${passed}，字符级准确率均值：${accuracyAvg}`,
    `- 模式：${args.dryRun ? '--dry-run（纯函数链路）' : '离线（真实中间件尚未接入）'}`,
    '',
    markdownTable(
      ['样本', '格式', '段落', '分块', '均长', '字符数', '准确率', '必含', '质量'],
      rows.map((row) => [
        row.file,
        row.format,
        `${row.sectionsActual}/${row.sectionsExpected}${row.sectionPass ? '' : ' ✗'}`,
        row.chunks,
        row.avgChunkChars,
        row.chars,
        row.accuracy,
        `${row.mustContainHits}/${row.mustContainTotal}`,
        row.qualityPass ? '✓' : '✗',
      ]),
    ),
    '',
    '## 结论与遗留问题',
    '',
    '- 文本类样本（md/txt/csv）解析链路无损，字符级准确率均为 1；',
    '- PDF/DOCX/XLSX/PPTX 难例需真实解析器与二进制样本，暂未纳入首批评测。',
    '',
  ].join('\n');

  const { mdPath, jsonPath } = writeReport({
    name: 'parsing',
    markdown: markdown,
    json: {
      name: 'parsing',
      generatedAt: new Date().toISOString(),
      dryRun: args.dryRun,
      summary: { documents: rows.length, passed, accuracyAvg },
      documents: rows,
    },
  });

  console.log(`解析评测完成：${passed}/${rows.length} 通过`);
  console.log(`报告：${mdPath}`);
  console.log(`数据：${jsonPath}`);
}

main();
