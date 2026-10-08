import { createHash } from 'node:crypto';

/**
 * 读写别名（I1）：对外唯一索引名，代码只认它。
 * 物理索引按版本号后缀，mapping 演进时建新版本再切别名，做到「切一刀」而非停服重建。
 */
export const CHUNK_INDEX_ALIAS = 'mind_vault_chunks';

/**
 * 当前物理索引版本；结构性变更时递增。
 *
 * v2：v1 是被动态 mapping 建出来的（keyword 字段退化成 text、没有 `_meta.mappingVersion`、
 * `titlePath` 也没走 ik），与代码里声明的 mapping 不一致；这里显式重建为声明式 mapping。
 */
export const CHUNK_INDEX_VERSION = 2;

/** 物理索引名：`mind_vault_chunks_v{n}` */
export function chunkIndexName(version: number): string {
  return `${CHUNK_INDEX_ALIAS}_v${version}`;
}

/** 分块索引 mapping：写入、查询与 es:migrate 建索引共用同一份定义 */
export function chunkIndexMapping(dimensions: number) {
  return {
    properties: {
      chunkId: { type: 'keyword' },
      parentId: { type: 'keyword' },
      ownerId: { type: 'keyword' },
      documentId: { type: 'keyword' },
      datasetIds: { type: 'keyword' },
      documentVersion: { type: 'integer' },
      sectionId: { type: 'keyword' },
      chunkOrder: { type: 'integer' },
      // 索引端用 ik_max_word 提高召回，检索端用 ik_smart 提高精度
      titlePath: {
        type: 'text',
        analyzer: 'ik_max_word',
        search_analyzer: 'ik_smart',
      },
      titleKeyword: { type: 'keyword' },
      text: {
        type: 'text',
        analyzer: 'ik_max_word',
        search_analyzer: 'ik_smart',
      },
      parentContext: { type: 'text', index: false },
      locator: { type: 'object', enabled: true },
      embedding: {
        type: 'dense_vector',
        dims: dimensions,
        index: true,
        similarity: 'cosine',
      },
      deleted: { type: 'boolean' },
      updatedAt: { type: 'date' },
    },
  };
}

/**
 * mapping 指纹：mapping 本身或其所依赖的 embedding 维度一旦变化必然改变。
 * 写入物理索引的 `_meta.mappingVersion`，供 ensureIndex 与 `npm run es:migrate` 比对。
 */
export function chunkMappingVersion(dimensions: number): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        mapping: chunkIndexMapping(dimensions),
        dimensions,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

/** 从 `indices.getMapping` 的返回体中取出物理索引的 mapping 版本 */
export function readMappingVersion(
  mapping: Record<string, unknown> | undefined,
): string | undefined {
  if (!mapping) return undefined;
  for (const value of Object.values(mapping)) {
    const meta = (value as { mappings?: { _meta?: unknown } })?.mappings?._meta;
    if (
      meta &&
      typeof meta === 'object' &&
      typeof (meta as { mappingVersion?: unknown }).mappingVersion === 'string'
    ) {
      return (meta as { mappingVersion: string }).mappingVersion;
    }
  }
  return undefined;
}
