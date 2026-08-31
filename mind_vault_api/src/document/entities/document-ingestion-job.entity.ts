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
}

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
