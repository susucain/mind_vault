import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * chunk 级检查点表：让「重试」可以断点续跑，不再重复下载/解析/embedding。
 *
 * 唯一键用 (document_id, document_version, section_id, chunk_order) 而非 chunk_id——
 * chunk_id 由文本派生，解析结果轻微漂移就会全部失配，键必须落在结构位置上。
 * embedding 用 bytea 存 float32（1024 维 ≈ 4KB/块），比 jsonb 省 3–5 倍体积。
 */
export class AddDocumentChunkCheckpoint1791417600000 implements MigrationInterface {
  name = 'AddDocumentChunkCheckpoint1791417600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kh_document_chunk (
        id varchar NOT NULL,
        owner_id bigint NOT NULL,
        document_id bigint NOT NULL,
        document_version integer NOT NULL,
        section_id varchar NOT NULL,
        chunk_order integer NOT NULL,
        chunk_id varchar NOT NULL,
        text text NOT NULL,
        parent_context text NOT NULL DEFAULT '',
        title_path jsonb NOT NULL DEFAULT '[]'::jsonb,
        locator_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        embedding bytea,
        content_hash varchar(64),
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT pk_kh_document_chunk PRIMARY KEY (id),
        CONSTRAINT uq_kh_document_chunk_version
          UNIQUE (document_id, document_version, section_id, chunk_order)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kh_document_chunk_lookup
        ON kh_document_chunk (owner_id, document_id, document_version)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kh_document_chunk_chunk_id
        ON kh_document_chunk (owner_id, document_id, chunk_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS kh_document_chunk`);
  }
}
