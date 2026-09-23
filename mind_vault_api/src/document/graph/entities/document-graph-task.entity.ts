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

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'dataset_ids', type: 'jsonb', default: () => "'[]'::jsonb" })
  datasetIds: string[];

  @Column({ type: 'varchar', default: GraphTaskStatus.Pending })
  status: GraphTaskStatus;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
