import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewWorkspaceSchema1790380800000 implements MigrationInterface {
  name = 'AddReviewWorkspaceSchema1790380800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_review_item
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kh_review_attempt (
        id VARCHAR PRIMARY KEY,
        review_item_id VARCHAR NOT NULL,
        owner_id BIGINT NOT NULL,
        answer TEXT NOT NULL,
        evaluation_json JSONB NOT NULL,
        citation_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        score DECIMAL(5,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kh_review_attempt_owner_item_created
        ON kh_review_attempt(owner_id, review_item_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_kh_review_attempt_owner_item_created',
    );
    await queryRunner.query('DROP TABLE IF EXISTS kh_review_attempt');
    await queryRunner.query(`
      ALTER TABLE kh_review_item
        DROP COLUMN IF EXISTS completed_at,
        DROP COLUMN IF EXISTS last_reviewed_at
    `);
  }
}
