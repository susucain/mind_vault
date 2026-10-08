import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';
import { DocumentStatus } from '../document-status';

/** 文档元数据（PostgreSQL kh_document） */
@Entity('kh_document')
export class DocumentEntity {
  /** 雪花 ID */
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  /** 标题 */
  @Column({ type: 'varchar' })
  title: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  /** MongoDB document_content._id */
  @Column({ name: 'content_id', type: 'varchar', unique: true })
  contentId: string;

  /** 摘要 */
  @Column({ type: 'varchar', nullable: true })
  summary?: string | null;

  /** 分类 ID */
  @Column({
    name: 'category_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  categoryId?: string | null;

  /** 团队 ID */
  @Column({
    name: 'team_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  teamId?: string | null;

  /** 作者 ID */
  @Column({
    name: 'author_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  authorId?: string | null;

  /** 封面图 URL */
  @Column({ name: 'cover_image', type: 'varchar', nullable: true })
  coverImage?: string | null;

  @Column({ name: 'source_file_name', type: 'varchar', nullable: true })
  sourceFileName?: string | null;

  @Column({ name: 'source_file_key', type: 'varchar', nullable: true })
  sourceFileKey?: string | null;

  @Column({ name: 'source_file_size', type: 'bigint', nullable: true })
  sourceFileSize?: string | null;

  @Column({ name: 'source_file_extension', type: 'varchar', nullable: true })
  sourceFileExtension?: string | null;

  /** 标签（逗号分隔） */
  @Column({ type: 'varchar', nullable: true })
  tags?: string | null;

  /** 聚合状态：0 处理中 / 1 可用 / 2 已归档 / 3 索引失败 */
  @Column({ type: 'smallint', default: DocumentStatus.Processing })
  status: DocumentStatus;

  /** 备注 */
  @Column({ type: 'varchar', nullable: true })
  remark?: string | null;

  /** 浏览数 */
  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  /** 点赞数 */
  @Column({ name: 'like_count', type: 'int', default: 0 })
  likeCount: number;

  /** 评论数 */
  @Column({ name: 'comment_count', type: 'int', default: 0 })
  commentCount: number;

  /** 收藏数 */
  @Column({ name: 'favourite_count', type: 'int', default: 0 })
  favouriteCount: number;

  /** 字数 */
  @Column({ name: 'word_count', type: 'int', default: 0 })
  wordCount: number;

  /** 发布时间 */
  @Column({ name: 'publish_time', type: 'timestamp', nullable: true })
  publishTime?: Date | null;

  /** 是否公开 */
  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean;

  /** 是否对该文档构建知识图谱，默认关闭，仅上传时显式开启 */
  @Column({ name: 'graph_enabled', type: 'boolean', default: false })
  graphEnabled: boolean;

  /** 上传幂等键（U2）：客户端超时重传沿用同一 Idempotency-Key，命中则短路返回既有文档 */
  @Column({ name: 'upload_key', type: 'varchar', nullable: true })
  uploadKey?: string | null;

  /** 内容指纹（U3）：服务端对上传字节计算的 sha256，用于同资料集内的重复文件拦截 */
  @Column({ name: 'content_hash', type: 'varchar', nullable: true })
  contentHash?: string | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  /** 创建人 ID */
  @Column({
    name: 'create_by',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  createBy?: string | null;

  /** 更新人 ID */
  @Column({
    name: 'update_by',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  updateBy?: string | null;

  /** 逻辑删除 */
  @Column({ type: 'boolean', default: false })
  deleted: boolean;
}
