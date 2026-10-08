import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 上传幂等键（U2）：客户端超时重传时沿用同一个 Idempotency-Key，
 * 服务端据此短路返回既有文档，避免同一份内容落成两份文档、两套 chunk 与两次 embedding。
 * Postgres 唯一索引对 NULL 不冲突，存量文档（upload_key 为 NULL）天然不受影响。
 */
export class AddDocumentUploadKey1791676800000 implements MigrationInterface {
  name = 'AddDocumentUploadKey1791676800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document
        ADD COLUMN IF NOT EXISTS upload_key VARCHAR NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_kh_document_owner_upload_key
        ON kh_document (owner_id, upload_key)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_kh_document_owner_upload_key`,
    );
    await queryRunner.query(`
      ALTER TABLE kh_document DROP COLUMN IF EXISTS upload_key
    `);
  }
}
