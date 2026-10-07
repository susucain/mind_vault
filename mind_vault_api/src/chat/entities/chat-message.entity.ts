import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

@Entity('kh_chat_message')
export class ChatMessageEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'conversation_id', type: 'varchar' })
  conversationId: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({ type: 'varchar' })
  role: 'user' | 'assistant';

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', default: 'COMPLETED' })
  status: string;

  @Column({ name: 'used_tools_json', type: 'jsonb', default: () => "'[]'" })
  usedTools: string[];

  /** 追问推荐（仅助手消息）：每轮回答后生成，供前端渲染可点的后续问题 */
  @Column({ name: 'suggestions_json', type: 'jsonb', default: () => "'[]'" })
  suggestions: string[];

  @Column({ type: 'varchar', nullable: true })
  model?: string | null;

  @Column({ type: 'boolean', default: false })
  thinking: boolean;

  @Column({ type: 'real', nullable: true })
  confidence?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
