import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInterviewTopicIntensity1790467200000 implements MigrationInterface {
  name = 'AddInterviewTopicIntensity1790467200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_interview_session
        ADD COLUMN IF NOT EXISTS topic VARCHAR,
        ADD COLUMN IF NOT EXISTS intensity VARCHAR NOT NULL DEFAULT 'deep',
        ADD COLUMN IF NOT EXISTS focus VARCHAR(200),
        ADD COLUMN IF NOT EXISTS job_description TEXT
    `);
    // 存量 mode 拆成主题与强度：快速问答归入项目深挖的快速强度
    await queryRunner.query(`
      UPDATE kh_interview_session
      SET topic = CASE mode
          WHEN 'quick_qa' THEN 'project_deep_dive'
          WHEN 'technical' THEN 'technical_fundamentals'
          WHEN 'behavioral' THEN 'behavioral'
          ELSE 'project_deep_dive'
        END,
        intensity = CASE WHEN mode = 'quick_qa' THEN 'quick' ELSE 'deep' END
      WHERE topic IS NULL
    `);
    await queryRunner.query(
      'ALTER TABLE kh_interview_session ALTER COLUMN topic SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE kh_interview_session DROP COLUMN IF EXISTS mode',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE kh_interview_session ADD COLUMN IF NOT EXISTS mode VARCHAR',
    );
    await queryRunner.query(`
      UPDATE kh_interview_session
      SET mode = CASE
          WHEN topic = 'technical_fundamentals' THEN 'technical'
          WHEN intensity = 'quick' THEN 'quick_qa'
          ELSE topic
        END
      WHERE mode IS NULL
    `);
    await queryRunner.query(
      'ALTER TABLE kh_interview_session ALTER COLUMN mode SET NOT NULL',
    );
    await queryRunner.query(`
      ALTER TABLE kh_interview_session
        DROP COLUMN IF EXISTS topic,
        DROP COLUMN IF EXISTS intensity,
        DROP COLUMN IF EXISTS focus,
        DROP COLUMN IF EXISTS job_description
    `);
  }
}
