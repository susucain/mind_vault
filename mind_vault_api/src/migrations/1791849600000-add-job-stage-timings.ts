import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M6：`kh_document_ingestion_job` 补 `stage_timings`，累积各阶段历史耗时。
 * 背景：`stage_started_at` 是单列，切到下一阶段即被覆盖，事后算不出各阶段耗时（§10.0 缺口 1）。
 * 口径：切阶段时把上一阶段耗时 append 进该列；模型 token 以 Langfuse 为准，不落库。
 */
export class AddJobStageTimings1791849600000 implements MigrationInterface {
  name = 'AddJobStageTimings1791849600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document_ingestion_job
        ADD COLUMN IF NOT EXISTS stage_timings jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document_ingestion_job
        DROP COLUMN IF EXISTS stage_timings
    `);
  }
}
