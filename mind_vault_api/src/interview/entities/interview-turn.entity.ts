import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

@Entity('kh_interview_turn')
export class InterviewTurnEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'session_id', type: 'varchar' })
  sessionId: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @Column({ name: 'evaluation_json', type: 'jsonb' })
  evaluation: Record<string, unknown>;

  @Column({ name: 'citation_ids_json', type: 'jsonb', default: () => "'[]'" })
  citationIds: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
