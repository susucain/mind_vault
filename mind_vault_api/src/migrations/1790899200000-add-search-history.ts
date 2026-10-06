import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchHistory1790899200000 implements MigrationInterface {
  name = 'AddSearchHistory1790899200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kh_search_history (
        id                VARCHAR PRIMARY KEY,
        owner_id          BIGINT       NOT NULL,
        mode              VARCHAR(16)  NOT NULL,
        query             VARCHAR(200) NOT NULL,
        dataset_ids_json  JSONB        NOT NULL DEFAULT '[]',
        entity_names_json JSONB        NOT NULL DEFAULT '[]',
        filters_json      JSONB        NOT NULL DEFAULT '{}',
        result_count      INT          NOT NULL DEFAULT 0,
        dedupe_key        VARCHAR(64)  NOT NULL,
        created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_kh_search_history_owner_created
        ON kh_search_history(owner_id, created_at DESC)
    `);
    // jsonb 没有默认 btree 操作符类，无法直接参与唯一约束，
    // 故用服务端计算的 dedupe_key 承担「同条件只留一条」的去重
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_kh_search_history_owner_dedupe
        ON kh_search_history(owner_id, dedupe_key)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS ux_kh_search_history_owner_dedupe',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS ix_kh_search_history_owner_created',
    );
    await queryRunner.query('DROP TABLE IF EXISTS kh_search_history');
  }
}
