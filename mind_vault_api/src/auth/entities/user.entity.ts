import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

/** 注册用户（PostgreSQL kh_user） */
@Entity('kh_user')
export class UserEntity {
  /** 雪花 ID，与业务表 owner_id 同源 */
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  /** 登录名；入库前统一 trim + 小写，唯一性不区分大小写 */
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  nickname?: string | null;

  /** 1 可用 / 0 禁用 */
  @Column({ type: 'smallint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
