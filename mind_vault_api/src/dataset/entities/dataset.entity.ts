import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

@Entity('kh_dataset')
export class DatasetEntity {
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  @Column({
    name: 'owner_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  ownerId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string | null;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
