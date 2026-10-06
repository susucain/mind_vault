import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';
import type { SearchHistoryFilters } from '../search-history.types';

/**
 * 检索历史（PostgreSQL kh_search_history）
 * 按 ownerId 隔离，不同用户不共享；写入由后端在检索编排完成后自动完成。
 */
@Entity('kh_search_history')
export class SearchHistoryEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({ type: 'varchar', length: 16 })
  mode: string;

  @Column({ type: 'varchar', length: 200 })
  query: string;

  @Column({
    name: 'dataset_ids_json',
    type: 'jsonb',
    default: () => "'[]'",
  })
  datasetIds: string[];

  @Column({
    name: 'entity_names_json',
    type: 'jsonb',
    default: () => "'[]'",
  })
  entityNames: string[];

  @Column({ name: 'filters_json', type: 'jsonb', default: () => "'{}'" })
  filters: SearchHistoryFilters;

  @Column({ name: 'result_count', type: 'int', default: 0 })
  resultCount: number;

  /** jsonb 无默认 btree 操作符类，无法直接参与唯一约束，用服务端计算的键承担去重 */
  @Column({ name: 'dedupe_key', type: 'varchar', length: 64 })
  dedupeKey: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
