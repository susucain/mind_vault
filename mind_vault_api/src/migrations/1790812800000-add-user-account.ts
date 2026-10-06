import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAccount1790812800000 implements MigrationInterface {
  name = 'AddUserAccount1790812800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kh_user (
        id BIGINT PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(64),
        status SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_kh_user_username
        ON kh_user(username)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS ux_kh_user_username');
    await queryRunner.query('DROP TABLE IF EXISTS kh_user');
  }
}
