import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

@Entity('kh_interview_session')
export class InterviewSessionEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({
    name: 'dataset_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  datasetId: string;

  @Column({ type: 'varchar' })
  topic: string;

  @Column({ type: 'varchar', default: 'deep' })
  intensity: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  focus?: string | null;

  @Column({ name: 'job_description', type: 'text', nullable: true })
  jobDescription?: string | null;

  @Column({ type: 'varchar', default: 'IN_PROGRESS' })
  status: string;

  @Column({ name: 'current_index', type: 'int', default: 0 })
  currentIndex: number;

  @Column({ name: 'total_questions', type: 'int', default: 5 })
  totalQuestions: number;

  @Column({ name: 'current_question', type: 'text', nullable: true })
  currentQuestion?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
