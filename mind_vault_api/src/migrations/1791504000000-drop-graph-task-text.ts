import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 图谱任务行不再存 chunk 全文：worker 处理时按 chunk_id 从 kh_document_chunk 取文本。
 * 收益：入队阶段的 Postgres 写入量与行膨胀显著下降，且「只补建图谱」不再依赖重新解析。
 */
export class DropGraphTaskText1791504000000 implements MigrationInterface {
  name = 'DropGraphTaskText1791504000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document_graph_task DROP COLUMN IF EXISTS text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_document_graph_task ADD COLUMN IF NOT EXISTS text text
    `);
  }
}
