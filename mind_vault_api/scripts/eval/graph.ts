import { join } from 'node:path';
import { normalizeEntityName } from '../../src/graph/entity-normalizer';
import { RELATION_TYPES } from '../../src/graph/graph-types';
import {
  EXPECTED_DIR,
  evaluate,
  markdownTable,
  ratio,
  readJson,
  writeReport,
} from './lib';

/**
 * 图谱评测（§10.3，`npm run eval:graph`）。
 *
 * 只覆盖可离线复现的两项：实体归一（归一等价类）与关系端点闭合（丢弃归因）。
 * 写库往返数、图谱耗时/token 依赖真实 Neo4j 与模型，需起依赖后另跑。
 */

interface GraphAnnotation {
  entities: Array<{ name: string; type: string }>;
  equivalenceGroups: Array<{ expected: string; members: string[] }>;
  expectedNormalized: Record<string, string>;
  relations: Array<{
    source: string;
    target: string;
    type: string;
    confidence: number;
  }>;
  expected: {
    entityCount: number;
    normalizedEntityCount: number;
    validRelations: number;
    dropped: { missingEndpoint: number; selfLoop: number; invalidType: number };
  };
}

function main(): void {
  const args = evaluate(process.argv.slice(2));
  const annotation = readJson<GraphAnnotation>(join(EXPECTED_DIR, 'graph.json'));

  // 归一期望：等价类成员 + 单点期望合并为一张 name → 期望归一名 表
  const expectedKeys = new Map<string, string>();
  for (const group of annotation.equivalenceGroups) {
    for (const member of group.members) expectedKeys.set(member, group.expected);
  }
  for (const [name, expected] of Object.entries(annotation.expectedNormalized)) {
    expectedKeys.set(name, expected);
  }

  const entityRows = annotation.entities.map((entity) => {
    const actual = normalizeEntityName(entity.name);
    const expected = expectedKeys.get(entity.name) ?? actual;
    return { name: entity.name, actual, expected, pass: actual === expected };
  });
  const normalizeHits = entityRows.filter((row) => row.pass).length;
  const normalizedNames = new Set(entityRows.map((row) => row.actual));

  const groupRows = annotation.equivalenceGroups.map((group) => {
    const keys = new Set(group.members.map((member) => normalizeEntityName(member)));
    const uniform = keys.size === 1 && keys.has(group.expected);
    const collision = group.members.some(
      (member) => expectedKeys.get(member) !== group.expected,
    );
    return {
      expected: group.expected,
      members: group.members.join(' / '),
      actual: [...keys].join(', '),
      pass: uniform && !collision,
    };
  });

  const knownKeys = new Set([...expectedKeys.values()]);
  let valid = 0;
  const dropped = { missingEndpoint: 0, selfLoop: 0, invalidType: 0 };
  const typeCounts = new Map<string, number>();
  for (const relation of annotation.relations) {
    typeCounts.set(relation.type, (typeCounts.get(relation.type) ?? 0) + 1);
    if (!(RELATION_TYPES as readonly string[]).includes(relation.type)) {
      dropped.invalidType += 1;
      continue;
    }
    const source = normalizeEntityName(relation.source);
    const target = normalizeEntityName(relation.target);
    if (source === target) {
      dropped.selfLoop += 1;
      continue;
    }
    if (!knownKeys.has(source) || !knownKeys.has(target)) {
      dropped.missingEndpoint += 1;
      continue;
    }
    valid += 1;
  }
  const relationTotal = annotation.relations.length;
  const relatedToRatio = ratio(
    (typeCounts.get('RELATED_TO') ?? 0) / (relationTotal || 1),
  );

  const normalizeAccuracy = ratio(normalizeHits / (entityRows.length || 1));
  const closureRate = ratio(valid / (relationTotal || 1));
  const droppedPass =
    dropped.missingEndpoint === annotation.expected.dropped.missingEndpoint &&
    dropped.selfLoop === annotation.expected.dropped.selfLoop &&
    dropped.invalidType === annotation.expected.dropped.invalidType;
  const pass =
    normalizeAccuracy === 1 &&
    groupRows.every((row) => row.pass) &&
    normalizedNames.size === annotation.expected.normalizedEntityCount &&
    valid === annotation.expected.validRelations &&
    droppedPass;

  const markdown = [
    `# 图谱评测报告（${new Date().toISOString()}）`,
    '',
    `- 实体数：${annotation.entities.length}，归一无重复数：${normalizedNames.size}（期望 ${annotation.expected.normalizedEntityCount}）`,
    `- 归一准确率：${normalizeAccuracy}，端点闭合率：${closureRate}`,
    `- 有效关系：${valid}/${relationTotal}，RELATED_TO 占比：${relatedToRatio}`,
    `- 丢弃：缺失端点 ${dropped.missingEndpoint} / 自环 ${dropped.selfLoop} / 非法类型 ${dropped.invalidType}`,
    `- 模式：${args.dryRun ? '--dry-run（纯函数链路）' : '离线（真实 Neo4j 尚未接入）'}`,
    '',
    markdownTable(
      ['等价类（期望归一名）', '成员', '实际归一名', '判定'],
      groupRows.map((row) => [
        row.expected,
        row.members,
        row.actual,
        row.pass ? '✓' : '✗',
      ]),
    ),
    '',
    '## 结论与遗留问题',
    '',
    `- 本项总判定：${pass ? '通过' : '未通过'}；`,
    '- 每 chunk 图写入往返数、每文档图谱耗时/token 需起 Neo4j 与模型依赖后补测。',
    '',
  ].join('\n');

  const { mdPath, jsonPath } = writeReport({
    name: 'graph',
    markdown,
    json: {
      name: 'graph',
      generatedAt: new Date().toISOString(),
      dryRun: args.dryRun,
      summary: {
        entities: annotation.entities.length,
        normalizedEntityCount: normalizedNames.size,
        normalizeAccuracy,
        closureRate,
        validRelations: valid,
        relatedToRatio,
        dropped,
        pass,
      },
      entities: entityRows,
      groups: groupRows,
    },
  });

  console.log(`图谱评测完成：${pass ? '通过' : '未通过'}`);
  console.log(`报告：${mdPath}`);
  console.log(`数据：${jsonPath}`);
}

main();
