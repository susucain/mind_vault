import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';
import type { InterviewEvaluation } from '../interview-model.service';

@Entity('kh_review_attempt')
export class ReviewAttemptEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'review_item_id', type: 'varchar' })
  reviewItemId: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({ type: 'text' })
  answer: string;

  @Column({ name: 'evaluation_json', type: 'jsonb' })
  evaluation: InterviewEvaluation;

  @Column({ name: 'citation_ids_json', type: 'jsonb', default: () => "'[]'" })
  citationIds: string[];

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  score: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
