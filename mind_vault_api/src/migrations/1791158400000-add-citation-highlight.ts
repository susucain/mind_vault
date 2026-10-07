import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 引用片段的高亮分段（HighlightSegment[]），只有关键字路径（lookup / hybrid）会产生，
 * 纯向量路径与存量引用均为 NULL，前端按无高亮渲染。用 jsonb 存结构而不是 HTML 串，
 * 前端渲染时不需要 innerHTML。
 */
export class AddCitationHighlight1791158400000 implements MigrationInterface {
  name = 'AddCitationHighlight1791158400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_chat_citation
        ADD COLUMN IF NOT EXISTS highlight_json JSONB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_chat_citation DROP COLUMN IF EXISTS highlight_json
    `);
  }
}