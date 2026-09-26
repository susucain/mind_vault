import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

@Entity('kh_review_item')
export class ReviewItemEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({ name: 'source_turn_id', type: 'varchar' })
  sourceTurnId: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: string;

  @Column({ name: 'due_at', type: 'timestamp', nullable: true })
  dueAt?: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date | null;

  @Column({ name: 'last_reviewed_at', type: 'timestamp', nullable: true })
  lastReviewedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
