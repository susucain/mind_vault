import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 图谱构建改为「显式开启」：默认 false，仅当上传时勾选才落图。
 * 存量文档需要通过回填保持既有行为——凡是已有图谱任务行的文档视为曾开启图谱，
 * 幂等回填为 true，其余保持 false（不主动回填，避免为历史文档凭空建立图谱预期）。
 */
export class AddGraphEnabled1791331200000 implements MigrationInterface {
  name = 'AddGraphEnabled1791331200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document
        ADD COLUMN IF NOT EXISTS graph_enabled BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE kh_document
        SET graph_enabled = true
        WHERE graph_enabled = false
          AND id IN (SELECT DISTINCT document_id FROM kh_document_graph_task)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document DROP COLUMN IF EXISTS graph_enabled
    `);
  }
}
