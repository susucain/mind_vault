import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

export enum GraphTaskStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Ready = 'READY',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
}

/** 单块图谱抽取质量计数（G3）：用于「丢了多少 / 截了多少」可度量 */
export interface GraphTaskQuality {
  entities: number;
  relations: number;
  dropped: {
    missingEndpoint: number;
    selfLoop: number;
    invalidType: number;
  };
  truncatedEntities: number;
  truncatedRelations: number;
  /** 关系类型分布（G5）：用于判断兜底类 RELATED_TO 占比是否过高 */
  relationTypes?: Record<string, number>;
}

@Entity('kh_document_graph_task')
export class DocumentGraphTaskEntity {
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

  @Column({ name: 'document_version', type: 'int' })
  documentVersion: number;

  @Column({ name: 'chunk_id', type: 'varchar' })
  chunkId: string;

  @Column({ name: 'dataset_ids', type: 'jsonb', default: () => "'[]'::jsonb" })
  datasetIds: string[];

  @Column({ type: 'varchar', default: GraphTaskStatus.Pending })
  status: GraphTaskStatus;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage?: string | null;

  /** 抽取 prompt 版本（G1）：质量回归时用于归因 */
  @Column({ name: 'prompt_version', type: 'int', nullable: true })
  promptVersion?: number | null;

  /** 单块质量计数（G3）：实体/关系条数 + 丢弃分类 + 截断量 */
  @Column({ name: 'quality', type: 'jsonb', default: () => "'{}'::jsonb" })
  quality: GraphTaskQuality;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
