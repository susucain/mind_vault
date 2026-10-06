import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 头像列只存对象存储的 object key，不存 URL 也不存二进制：
 * URL 会随存储切换（本地 RustFS → 阿里云 OSS）失效，二进制会把行撑大。
 */
export class AddUserAvatar1790985600000 implements MigrationInterface {
  name = 'AddUserAvatar1790985600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_user
        ADD COLUMN IF NOT EXISTS avatar_key VARCHAR(255)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kh_user DROP COLUMN IF EXISTS avatar_key
    `);
  }
}
