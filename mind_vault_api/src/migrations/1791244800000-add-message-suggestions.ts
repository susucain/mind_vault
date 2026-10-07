import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 助手消息的追问推荐（string[]）。存量消息为空数组，
 * 前端据此回落到静态通用引导，不需要回溯生成。
 */
export class AddMessageSuggestions1791244800000 implements MigrationInterface {
  name = 'AddMessageSuggestions1791244800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_chat_message
        ADD COLUMN IF NOT EXISTS suggestions_json JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_chat_message DROP COLUMN IF EXISTS suggestions_json
    `);
  }
}