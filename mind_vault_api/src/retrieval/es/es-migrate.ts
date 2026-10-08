import {
  CHUNK_INDEX_ALIAS,
  CHUNK_INDEX_VERSION,
  chunkIndexMapping,
  chunkIndexName,
  chunkMappingVersion,
} from './chunk-index-mapping';

/** 迁移所需的最小 ES 客户端面；便于单测注入假实现，避免依赖真实集群 */
export interface MigrateClient {
  indices: {
    exists(input: { index: string }): Promise<boolean>;
    create(input: unknown): Promise<unknown>;
    getAlias(input: { name: string }): Promise<Record<string, unknown>>;
    updateAliases(input: { actions: unknown[] }): Promise<unknown>;
  };
  reindex(input: {
    source: { index: string };
    dest: { index: string };
    wait_for_completion: boolean;
  }): Promise<{ created?: number; total?: number; failures?: unknown[] }>;
}

export interface MigrateOptions {
  /** 目标物理版本号，默认取代码里的 `CHUNK_INDEX_VERSION` */
  version?: number;
  /** embedding 维度，默认 1024（与 configuration.ts 默认一致） */
  dimensions?: number;
  /** 为 false 时只切别名、不重灌数据（例如新索引已手工灌好） */
  reindex?: boolean;
  logger?: (message: string) => void;
}

export interface MigrateResult {
  alias: string;
  from?: string;
  to: string;
  created: boolean;
  reindexed: number;
  switched: boolean;
}

/**
 * 索引迁移（I1/I7）：建新版本索引 → 从当前别名指向的旧索引重灌 → 切别名。
 * 旧索引一律保留，回滚 = 反向再跑一次（别名切回）。
 * 必须先灌完再切别名，避免出现「别名指向空索引」的检索空洞。
 */
export async function migrateChunkIndex(
  client: MigrateClient,
  options: MigrateOptions = {},
): Promise<MigrateResult> {
  const alias = CHUNK_INDEX_ALIAS;
  const version = options.version ?? CHUNK_INDEX_VERSION;
  const dimensions = options.dimensions ?? 1024;
  const target = chunkIndexName(version);
  const log = options.logger ?? (() => undefined);

  const from = await resolveAliasIndex(client, alias);
  const exists = await client.indices.exists({ index: target });
  if (!exists) {
    await client.indices.create({
      index: target,
      mappings: {
        _meta: { mappingVersion: chunkMappingVersion(dimensions) },
        ...chunkIndexMapping(dimensions),
      },
    });
    log(`已创建物理索引 ${target}`);
  }

  if (from === target) {
    log(`别名 ${alias} 已指向 ${target}，无需切换`);
    return {
      alias,
      from,
      to: target,
      created: !exists,
      reindexed: 0,
      switched: false,
    };
  }

  let reindexed = 0;
  if (from && options.reindex !== false) {
    const result = await client.reindex({
      source: { index: from },
      dest: { index: target },
      wait_for_completion: true,
    });
    if (result.failures?.length) {
      throw new Error(`_reindex 存在失败条目: ${result.failures.length} 条`);
    }
    reindexed = result.created ?? result.total ?? 0;
    log(`已从 ${from} 重灌 ${reindexed} 条到 ${target}`);
  }

  await client.indices.updateAliases({
    actions: [
      { remove: { index: '*', alias } },
      { add: { index: target, alias } },
    ],
  });
  log(
    `别名 ${alias} 已切至 ${target}` +
      (from ? `（旧索引 ${from} 保留，回滚可再跑一次并指定 --version）` : ''),
  );
  return {
    alias,
    from,
    to: target,
    created: !exists,
    reindexed,
    switched: true,
  };
}

/** 解析别名当前指向的物理索引；别名不存在时返回 undefined */
async function resolveAliasIndex(
  client: MigrateClient,
  alias: string,
): Promise<string | undefined> {
  try {
    const result = await client.indices.getAlias({ name: alias });
    return Object.keys(result ?? {})[0];
  } catch {
    return undefined;
  }
}

/** 解析 CLI 参数：`--version <n>` 指定目标版本（回滚时指向旧版本），`--skip-reindex` 跳过重灌 */
export function parseMigrateArgs(argv: string[]): {
  version?: number;
  reindex: boolean;
} {
  let version: number | undefined;
  let reindex = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      version = positiveInt(argv[index + 1]) ?? version;
      index += 1;
      continue;
    }
    if (arg.startsWith('--version=')) {
      version = positiveInt(arg.slice('--version='.length)) ?? version;
      continue;
    }
    if (arg === '--skip-reindex') reindex = false;
  }
  return { version, reindex };
}

function positiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
