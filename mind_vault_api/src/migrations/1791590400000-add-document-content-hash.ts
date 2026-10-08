import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 内容指纹（U3）：服务端对上传字节计算 sha256 后写入 content_hash，
 * 同一 ownerId + datasetId 下命中同 hash 且未删除的文档会被 409 拒绝，
 * 避免同一份内容重复产生 embedding、图谱抽取与存储费用。
 * 纯增量迁移：列可空，存量数据为 NULL 即不参与去重。
 */
export class AddDocumentContentHash1791590400000 implements MigrationInterface {
  name = 'AddDocumentContentHash1791590400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document
        ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document DROP COLUMN IF EXISTS content_hash
    `);
  }
}
