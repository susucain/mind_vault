import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 收藏是会话自身的属性（列表页要据此过滤/排序），所以加在 kh_conversation 上而不是另建一张表。
 * 默认 false 且非空，存量会话自动落入「未收藏」，无需回填。
 */
export class AddConversationFavorite1791072000000 implements MigrationInterface {
  name = 'AddConversationFavorite1791072000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_conversation
        ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_conversation DROP COLUMN IF EXISTS favorite
    `);
  }
}