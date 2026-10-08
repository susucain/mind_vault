import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

export enum IngestionJobOperation {
  Index = 'index',
  Delete = 'delete',
  Reindex = 'reindex',
}

export enum IngestionJobStatus {
  Uploaded = 'UPLOADED',
  Parsing = 'PARSING',
  Parsed = 'PARSED',
  Chunking = 'CHUNKING',
  Embedding = 'EMBEDDING',
  Indexing = 'INDEXING',
  Ready = 'READY',
  Failed = 'FAILED',
  /** 用户在上传后、worker 接手前主动取消（U8 档 1）；status 为 varchar，无需迁移 */
  Cancelled = 'CANCELLED',
  Deleting = 'DELETING',
  Deleted = 'DELETED',
}

/**
 * 单个阶段的累计耗时（M6）。
 * 口径：`currentStage` 从该阶段切到下一阶段之间的间隔；重试续跑会对同一阶段累加。
 * 模型 token / 模型耗时以 Langfuse 为准，业务库不重复落 token（见 §10.2）。
 */
export interface StageTiming {
  /** 该阶段累计耗时（毫秒） */
  ms: number;
  /** 该阶段进入次数（重试续跑会累加） */
  runs: number;
}

export type JobStageTimings = Record<string, StageTiming>;

@Entity('kh_document_ingestion_job')
export class DocumentIngestionJobEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({
    name: 'document_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  documentId: string;

  @Column({ name: 'document_version', type: 'int', default: 1 })
  documentVersion: number;

  @Column({ type: 'varchar' })
  operation: IngestionJobOperation;

  @Column({ type: 'varchar' })
  status: IngestionJobStatus;

  @Column({ name: 'current_stage', type: 'varchar', nullable: true })
  currentStage?: string | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'stage_started_at', type: 'timestamp', nullable: true })
  stageStartedAt?: Date | null;

  /** 各阶段累计耗时（M6）：worker 每次切阶段时 append，事后可算各阶段历史耗时 */
  @Column({
    name: 'stage_timings',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  stageTimings: JobStageTimings;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt?: Date | null;

  @Column({ name: 'stage_completed', type: 'int', default: 0 })
  stageCompleted: number;

  @Column({ name: 'stage_total', type: 'int', default: 0 })
  stageTotal: number;

  @Column({ name: 'last_heartbeat_at', type: 'timestamp', nullable: true })
  lastHeartbeatAt?: Date | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'error_code', type: 'varchar', nullable: true })
  errorCode?: string | null;

  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
