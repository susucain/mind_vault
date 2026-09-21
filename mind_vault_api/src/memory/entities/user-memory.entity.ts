import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';
import type { MemoryKind, MemoryStatus } from '../memory.types';

/**
 * 向量列 embedding 由 memory.service 的原生 SQL 读写，不映射到实体：
 * TypeORM 不认识 vector 类型，映射它会逼着引入 pgvector 依赖。
 */
@Entity('kh_user_memory')
export class UserMemoryEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar' })
  kind: MemoryKind;

  @Column({ name: 'source_conversation_id', type: 'varchar', nullable: true })
  sourceConversationId?: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: MemoryStatus;

  @Column({ name: 'hit_count', type: 'int', default: 0 })
  hitCount: number;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
