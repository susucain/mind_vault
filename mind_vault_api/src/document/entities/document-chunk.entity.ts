import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';
import type { DocumentLocator } from '../parser/parsed-document';

/**
 * chunk 级检查点（PostgreSQL kh_document_chunk）。
 *
 * 唯一键落在结构位置 `(document_id, document_version, section_id, chunk_order)`
 * 而不是 `chunk_id`——后者由文本派生，解析结果轻微漂移就会整体失配。
 * 有了它，retry 可以跳过 parsing/chunking/embedding 直接续跑到 indexing。
 */
@Entity('kh_document_chunk')
@Unique('uq_kh_document_chunk_version', [
  'documentId',
  'documentVersion',
  'sectionId',
  'chunkOrder',
])
export class DocumentChunkEntity {
  /** 雪花 ID */
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

  @Column({ name: 'section_id', type: 'varchar' })
  sectionId: string;

  @Column({ name: 'chunk_order', type: 'int' })
  chunkOrder: number;

  /** 与 ES 文档 _id 对齐 */
  @Column({ name: 'chunk_id', type: 'varchar' })
  chunkId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'parent_context', type: 'text', default: '' })
  parentContext: string;

  @Column({ name: 'title_path', type: 'jsonb', default: () => "'[]'::jsonb" })
  titlePath: string[];

  @Column({ name: 'locator_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  locator: DocumentLocator;

  /** 向量检查点：float32 原始字节（bytea，1024 维 ≈ 4KB/块） */
  @Column({ type: 'bytea', nullable: true })
  embedding?: Buffer | null;

  /** 文本指纹，用于识别解析结果漂移 */
  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true })
  contentHash?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
