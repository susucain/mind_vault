import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';
import { HighlightSegment } from '../../retrieval/retrieval-hit';

@Entity('kh_chat_citation')
export class ChatCitationEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'message_id', type: 'varchar' })
  messageId: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({
    name: 'document_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  documentId: string;

  @Column({ name: 'chunk_id', type: 'varchar' })
  chunkId: string;

  @Column({ type: 'text' })
  quote: string;

  @Column({ name: 'locator_json', type: 'jsonb' })
  locator: Record<string, unknown>;

  @Column({ type: 'int' })
  rank: number;

  /** 命中片段的高亮分段；仅关键字路径产生，向量路径与存量数据为 null */
  @Column({ name: 'highlight_json', type: 'jsonb', nullable: true })
  highlight: HighlightSegment[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
