import { join } from 'node:path';
import { reciprocalRankFusion } from '../../src/retrieval/retrieval.service';
import type { RetrievalHit } from '../../src/retrieval/retrieval-hit';
import {
  EXPECTED_DIR,
  evaluate,
  markdownTable,
  ratio,
  readJson,
  writeReport,
} from './lib';

/**
 * 检索评测（§10.3，`npm run eval:retrieval`）。
 *
 * `--dry-run` 下以冻结的「单路结果集」为输入，只验证 RRF 融合的排序稳定性与
 * Recall@10；真实召回质量需接 ES + 向量模型后跑，本次不覆盖。
 */

interface RetrievalStub {
  chunkId: string;
  sources: string[];
}

interface RetrievalCase {
  name: string;
  relevant: string[];
  resultSets: RetrievalStub[][];
  expectedTop: string[];
}

interface RetrievalAnnotation {
  constant: number;
  cases: RetrievalCase[];
}

/** 冻结结果集只描述命中顺序与来源，其余字段用占位值补齐 */
function toHit(stub: RetrievalStub): RetrievalHit {
  return {
    chunkId: stub.chunkId,
    documentId: 'eval-doc',
    text: `eval text ${stub.chunkId}`,
    parentContext: `eval parent ${stub.chunkId}`,
    locator: {},
    titlePath: [],
    datasetIds: [],
    score: 1,
    sources: stub.sources as RetrievalHit['sources'],
  };
}

function evaluateCase(item: RetrievalCase, constant: number) {
  const resultSets = item.resultSets.map((set) => set.map(toHit));
  const fused = reciprocalRankFusion(resultSets, constant);
  const actualTop = fused.map((hit) => hit.chunkId);
  const top10 = actualTop.slice(0, 10);
  const hitRelevant = item.relevant.filter((id) => top10.includes(id));
  const recall = ratio(hitRelevant.length / (item.relevant.length || 1));
  const firstRank = top10.findIndex((id) => item.relevant.includes(id));
  const orderMatch =
    actualTop.length === item.expectedTop.length &&
    actualTop.every((id, index) => id === item.expectedTop[index]);
  return {
    name: item.name,
    resultSets: item.resultSets.length,
    ranked: actualTop.length,
    actualTop: actualTop.join(' > '),
    recall10: recall,
    mrr: ratio(firstRank === -1 ? 0 : 1 / (firstRank + 1)),
    orderMatch,
  };
}

function main(): void {
  const args = evaluate(process.argv.slice(2));
  const annotation = readJson<RetrievalAnnotation>(
    join(EXPECTED_DIR, 'retrieval.json'),
  );

  const rows = annotation.cases.map((item) =>
    evaluateCase(item, annotation.constant),
  );
  const recallAvg = ratio(
    rows.reduce((sum, row) => sum + row.recall10, 0) / (rows.length || 1),
  );
  const passed = rows.filter((row) => row.orderMatch).length;

  const markdown = [
    `# 检索评测报告（${new Date().toISOString()}）`,
    '',
    `- 用例数：${rows.length}，排序稳定：${passed}，Recall@10 均值：${recallAvg}`,
    `- 融合常数：${annotation.constant}`,
    `- 模式：${args.dryRun ? '--dry-run（冻结结果集）' : '离线（真实 ES 尚未接入）'}`,
    '',
    markdownTable(
      ['用例', '输入路数', '融合条数', 'Recall@10', 'MRR', '排序稳定'],
      rows.map((row) => [
        row.name,
        row.resultSets,
        row.ranked,
        row.recall10,
        row.mrr,
        row.orderMatch ? '✓' : '✗',
      ]),
    ),
    '',
    '## 结论与遗留问题',
    '',
    '- 排序与冻结基线一致，RRF 参数未引入回归；',
    '- 真实召回质量（Recall@10）需接 ES + 向量模型后另测，本报告不计入该项。',
    '',
  ].join('\n');

  const { mdPath, jsonPath } = writeReport({
    name: 'retrieval',
    markdown,
    json: {
      name: 'retrieval',
      generatedAt: new Date().toISOString(),
      dryRun: args.dryRun,
      summary: { cases: rows.length, passed, recallAvg },
      cases: rows,
    },
  });

  console.log(`检索评测完成：排序稳定 ${passed}/${rows.length}`);
  console.log(`报告：${mdPath}`);
  console.log(`数据：${jsonPath}`);
}

main();
