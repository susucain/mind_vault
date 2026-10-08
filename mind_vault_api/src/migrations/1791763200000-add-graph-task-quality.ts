import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 图谱任务行补上「质量可观测」字段（M 阶段 G1/G3）：
 * - `prompt_version`：记录抽取 prompt 版本，使「改了 prompt 质量变好/变坏」可归因；
 * - `quality`：单块抽取质量计数（实体/关系条数、被丢弃关系分类、截断量）。
 */
export class AddGraphTaskQuality1791763200000 implements MigrationInterface {
  name = 'AddGraphTaskQuality1791763200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document_graph_task
        ADD COLUMN IF NOT EXISTS prompt_version int,
        ADD COLUMN IF NOT EXISTS quality jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document_graph_task
        DROP COLUMN IF EXISTS quality,
        DROP COLUMN IF EXISTS prompt_version
    `);
  }
}
