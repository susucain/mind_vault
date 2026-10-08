import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 评测资产根目录：`mind_vault_api/test/fixtures`（jest `rootDir=src`，天然不扫描） */
export const FIXTURES_DIR = resolve(__dirname, '../../test/fixtures');
export const DOCUMENTS_DIR = join(FIXTURES_DIR, 'documents');
export const EXPECTED_DIR = join(FIXTURES_DIR, 'expected');
export const REPORTS_DIR = join(FIXTURES_DIR, 'reports');

export interface EvalArgs {
  dryRun: boolean;
}

/** 评测脚本统一的参数解析：`--dry-run` 表示只跑纯函数链路，不依赖中间件 */
export function parseEvalArgs(argv: string[]): EvalArgs {
  return { dryRun: argv.includes('--dry-run') };
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** 列出样本目录下指定扩展名的文件（已排序，保证报告可比对） */
export function listFixtureFiles(extensions: string[]): string[] {
  const suffixes = extensions.map((extension) => `.${extension.toLowerCase()}`);
  return readdirSync(DOCUMENTS_DIR)
    .filter((name) => suffixes.some((suffix) => name.toLowerCase().endsWith(suffix)))
    .sort();
}

/** 字符级比对前的归一化：NFKC + 统一换行 + 压缩空白 */
export function normalizeForCompare(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Levenshtein 距离（滚动数组）：字符级准确率 = 1 − 距离 / 参考长度 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = [...current];
  }
  return previous[b.length];
}

/** 保留 4 位小数，便于与基线 diff */
export function ratio(value: number): number {
  return Number(value.toFixed(4));
}

export function markdownTable(
  headers: string[],
  rows: Array<Array<string | number>>,
): string {
  const header = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows
    .map((row) => `| ${row.map((cell) => String(cell)).join(' | ')} |`)
    .join('\n');
  return [header, separator, body].join('\n');
}

export interface EvalReport {
  /** 报告名（不含日期与前缀），如 `parsing` */
  name: string;
  markdown: string;
  json: unknown;
}

/**
 * 输出人工可读的 md + 机器可比的 json（§10.3）：
 * `test/fixtures/reports/<date>-<name>.{md,json}`，同名覆盖，便于反复 diff。
 */
export function writeReport(report: EvalReport): {
  mdPath: string;
  jsonPath: string;
} {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const mdPath = join(REPORTS_DIR, `${date}-${report.name}.md`);
  const jsonPath = join(REPORTS_DIR, `${date}-${report.name}.json`);
  writeFileSync(mdPath, report.markdown, 'utf8');
  writeFileSync(jsonPath, `${JSON.stringify(report.json, null, 2)}\n`, 'utf8');
  return { mdPath, jsonPath };
}

export function evaluate(argv: string[]): EvalArgs {
  const args = parseEvalArgs(argv);
  if (!args.dryRun) {
    console.warn(
      '提示：真实中间件采集路径尚未接入，本次按冻结结果集离线评测（等价于 --dry-run）。',
    );
  }
  return args;
}
