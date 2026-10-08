import { normalizeEntityName } from './entity-normalizer';
import { RELATION_TYPES } from './graph-types';

/**
 * 存量实体合并（G2）。归一规则上线前写入的实体节点，其 `normalizedName` 由旧规则
 * （仅 trim + 小写）得到；新规则（NFKC、去括号、连字符、保守复数……）会让一部分
 * 「本应同一个」的节点仍分裂。本模块离线扫描同 owner 下所有实体，按新规则重新分组，
 * 把重复节点并入保留节点：迁移 `MENTIONED_IN` 与关系边、收集别名、删除旧节点。
 *
 * 只做「相同归一名」的确定性合并，不做语义同义判定（D11）。
 * 默认预演（`apply: false`），确认报告后再以 `apply: true` 落库。
 */

export interface EntityMergeRow {
  id: string;
  name: string;
  aliases?: string[];
}

export interface EntityMergeGroup {
  /** 合并后的归一名 */
  target: string;
  /** 被保留节点的当前归一名 */
  canonicalId: string;
  duplicates: EntityMergeRow[];
}

export interface EntityMergePlan {
  ownerId: string;
  before: number;
  after: number;
  groups: EntityMergeGroup[];
}

export interface EntityMergeReport extends EntityMergePlan {
  applied: boolean;
  mergedNodes: number;
}

export interface EntityMergeClient {
  run(
    cypher: string,
    params: Record<string, unknown>,
  ): Promise<{ records: { get(key: string): unknown }[] }>;
}

/** 与写入侧保持一致：别名展示上限 */
const MAX_ALIASES = 10;

export function planEntityMerge(
  ownerId: string,
  rows: EntityMergeRow[],
): EntityMergePlan {
  const considered = rows.filter((row) => row.id);
  const groups = new Map<string, EntityMergeRow[]>();
  for (const row of considered) {
    // 展示名归一失败时退回节点自身的归一名
    const target = normalizeEntityName(row.name) || row.id;
    const bucket = groups.get(target) ?? [];
    bucket.push(row);
    groups.set(target, bucket);
  }
  const merges: EntityMergeGroup[] = [];
  for (const [target, bucket] of groups) {
    if (bucket.length < 2) continue;
    // 已有节点归名等于目标时自然作为保留点，否则取首个并改名
    const canonical = bucket.find((row) => row.id === target) ?? bucket[0];
    merges.push({
      target,
      canonicalId: canonical.id,
      duplicates: bucket.filter((row) => row.id !== canonical.id),
    });
  }
  return {
    ownerId,
    before: considered.length,
    after: groups.size,
    groups: merges,
  };
}

export async function runEntityMerge(
  client: EntityMergeClient,
  options: {
    ownerId: string;
    apply?: boolean;
    logger?: (message: string) => void;
  },
): Promise<EntityMergeReport> {
  const logger = options.logger ?? (() => undefined);
  const rows = await listEntities(client, options.ownerId);
  const plan = planEntityMerge(options.ownerId, rows);
  const mergedNodes = plan.groups.reduce(
    (sum, group) => sum + group.duplicates.length,
    0,
  );
  const report: EntityMergeReport = {
    ...plan,
    applied: false,
    mergedNodes,
  };
  logger(
    `实体合并${options.apply ? '' : '（预演）'}：owner=${plan.ownerId} ` +
      `合并前=${plan.before} 合并后=${plan.after} 合并组=${plan.groups.length} 归并节点=${mergedNodes}`,
  );
  if (!options.apply) return report;

  for (const group of plan.groups) {
    await applyGroup(client, plan.ownerId, group);
  }
  return { ...report, applied: true };
}

async function listEntities(
  client: EntityMergeClient,
  ownerId: string,
): Promise<EntityMergeRow[]> {
  const result = await client.run(
    `
    MATCH (entity:Entity {ownerId: $ownerId})
    RETURN entity.normalizedName AS id, entity.name AS name, entity.aliases AS aliases
    `,
    { ownerId },
  );
  return result.records
    .map((record) => {
      const id = asString(record.get('id'));
      return {
        id,
        name: asString(record.get('name')) || id,
        aliases: asStringArray(record.get('aliases')),
      };
    })
    .filter((row) => row.id);
}

async function applyGroup(
  client: EntityMergeClient,
  ownerId: string,
  group: EntityMergeGroup,
): Promise<void> {
  const { target, canonicalId, duplicates } = group;
  if (canonicalId !== target) {
    await client.run(
      `
      MATCH (canonical:Entity {ownerId: $ownerId, normalizedName: $canonicalId})
      SET canonical.normalizedName = $target
      `,
      { ownerId, canonicalId, target },
    );
  }
  for (const duplicate of duplicates) {
    const dupId = duplicate.id;
    await client.run(MOVE_MENTIONS, { ownerId, dupId, target });
    for (const relationType of RELATION_TYPES) {
      await client.run(outgoingMove(relationType), { ownerId, dupId, target });
      await client.run(incomingMove(relationType), { ownerId, dupId, target });
    }
    await client.run(MERGE_ALIASES, {
      ownerId,
      dupId,
      target,
      aliasCandidates: [...(duplicate.aliases ?? []), duplicate.name],
    });
  }
}

const MOVE_MENTIONS = `
MATCH (dup:Entity {ownerId: $ownerId, normalizedName: $dupId})-[mention:MENTIONED_IN {ownerId: $ownerId}]->(chunk)
MATCH (target:Entity {ownerId: $ownerId, normalizedName: $target})
MERGE (target)-[:MENTIONED_IN {ownerId: $ownerId}]->(chunk)
DELETE mention`;

/** 出边迁移：先并按 `sourceChunkId` 去重；若 other 恰为保留点则丢弃（会成自环） */
function outgoingMove(relationType: string): string {
  return `
MATCH (dup:Entity {ownerId: $ownerId, normalizedName: $dupId})-[relation:${relationType} {ownerId: $ownerId}]->(other:Entity)
MATCH (target:Entity {ownerId: $ownerId, normalizedName: $target})
FOREACH (_ IN CASE WHEN other = target THEN [] ELSE [1] END |
  MERGE (target)-[merged:${relationType} {ownerId: $ownerId, sourceChunkId: relation.sourceChunkId}]->(other)
  SET merged.confidence = relation.confidence
)
DELETE relation`;
}

/** 入边迁移：对称处理 */
function incomingMove(relationType: string): string {
  return `
MATCH (other:Entity)-[relation:${relationType} {ownerId: $ownerId}]->(dup:Entity {ownerId: $ownerId, normalizedName: $dupId})
MATCH (target:Entity {ownerId: $ownerId, normalizedName: $target})
FOREACH (_ IN CASE WHEN other = target THEN [] ELSE [1] END |
  MERGE (other)-[merged:${relationType} {ownerId: $ownerId, sourceChunkId: relation.sourceChunkId}]->(target)
  SET merged.confidence = relation.confidence
)
DELETE relation`;
}

/** 收集被删节点的写法与别名到保留点，再删除旧节点 */
const MERGE_ALIASES = `
MATCH (dup:Entity {ownerId: $ownerId, normalizedName: $dupId})
MATCH (target:Entity {ownerId: $ownerId, normalizedName: $target})
SET target.aliases = reduce(acc = coalesce(target.aliases, []), candidate IN $aliasCandidates |
  CASE
    WHEN candidate IS NULL OR candidate = '' OR candidate = target.name THEN acc
    WHEN candidate IN acc THEN acc
    ELSE (acc + candidate)[..${MAX_ALIASES}]
  END)
DETACH DELETE dup`;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
  return items.length > 0 ? items : undefined;
}
