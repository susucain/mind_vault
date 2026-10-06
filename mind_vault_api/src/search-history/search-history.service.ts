import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { SearchHistoryEntity } from './entities/search-history.entity';
import {
  SearchHistoryEntry,
  SearchHistoryRecordInput,
} from './search-history.types';

/** 单用户保留的历史条数上限 */
const MAX_ENTRIES_PER_OWNER = 50;

@Injectable()
export class SearchHistoryService {
  private readonly logger = new Logger(SearchHistoryService.name);

  constructor(
    @InjectRepository(SearchHistoryEntity)
    private readonly history: Repository<SearchHistoryEntity>,
  ) {}

  /**
   * 记录一次检索。写库失败只记 warn，绝不影响检索响应。
   * 用 dedupeKey 做 upsert：同条件重复检索只刷新 resultCount 与 createdAt。
   */
  async record(input: SearchHistoryRecordInput): Promise<void> {
    try {
      await this.history.query(
        `INSERT INTO kh_search_history
           (id, owner_id, mode, query, dataset_ids_json, entity_names_json,
            filters_json, result_count, dedupe_key, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, NOW())
         ON CONFLICT (owner_id, dedupe_key)
         DO UPDATE SET result_count = EXCLUDED.result_count, created_at = NOW()`,
        [
          nextSnowflakeId(),
          input.ownerId,
          input.mode,
          input.query,
          JSON.stringify(input.datasetIds),
          JSON.stringify(input.entityNames),
          JSON.stringify(input.filters),
          input.resultCount,
          dedupeKeyOf(input),
        ],
      );
      await this.trim(input.ownerId);
    } catch (error) {
      this.logger.warn(`检索历史写入失败（不影响检索结果）: ${String(error)}`);
    }
  }

  async list(ownerId: string, limit: number): Promise<SearchHistoryEntry[]> {
    const rows = await this.history.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      mode: row.mode,
      query: row.query,
      datasetIds: row.datasetIds ?? [],
      entityNames: row.entityNames ?? [],
      filters: row.filters,
      resultCount: row.resultCount,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** 非本人记录返回 NotFoundException，不泄露记录是否存在 */
  async remove(ownerId: string, id: string): Promise<void> {
    const result = await this.history.delete({ id, ownerId });
    if (!result.affected) throw new NotFoundException();
  }

  async clear(ownerId: string): Promise<{ deleted: number }> {
    const result = await this.history.delete({ ownerId });
    return { deleted: result.affected ?? 0 };
  }

  private async trim(ownerId: string): Promise<void> {
    await this.history.query(
      `DELETE FROM kh_search_history
       WHERE owner_id = $1
         AND id NOT IN (
           SELECT id FROM kh_search_history
           WHERE owner_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         )`,
      [ownerId, MAX_ENTRIES_PER_OWNER],
    );
  }
}

/**
 * 去重键：同 mode / query / datasetIds / entityNames / filters 视为同一次检索。
 * 刻意不含 page —— 翻页属于同一次检索，不应产生新记录。
 */
function dedupeKeyOf(input: SearchHistoryRecordInput): string {
  const parts = [
    input.mode,
    input.query,
    [...input.datasetIds].sort().join(','),
    [...input.entityNames].sort().join(','),
    JSON.stringify({
      sort: input.filters.sort,
      from: input.filters.from,
      to: input.filters.to,
      pageSize: input.filters.pageSize,
      maxHops: input.filters.maxHops,
    }),
  ];
  return createHash('sha256')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 32);
}
