import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

@Entity('kh_conversation')
export class ConversationEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ name: 'dataset_ids_json', type: 'jsonb', default: () => "'[]'" })
  datasetIds: string[];

  /** 滑出短期记忆窗口的更早轮次摘要 */
  @Column({ type: 'text', nullable: true })
  summary?: string | null;

  /** 已纳入摘要的消息条数，作为增量压缩的游标 */
  @Column({ name: 'summarized_message_count', type: 'int', default: 0 })
  summarizedMessageCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
