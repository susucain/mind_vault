import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameBehavioralTopicToJobFit1790553600000 implements MigrationInterface {
  name = 'RenameBehavioralTopicToJobFit1790553600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE kh_interview_session
      SET topic = 'job_fit'
      WHERE topic = 'behavioral'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE kh_interview_session
      SET topic = 'behavioral'
      WHERE topic = 'job_fit'
    `);
  }
}
