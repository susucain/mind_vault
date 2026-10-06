import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt 参数：内存与耗时折中，单次校验约几十毫秒 */
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

function derive(
  plain: string,
  salt: string,
  keyLength: number,
  cost: number,
  blockSize: number,
  parallelization: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      plain,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelization },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

/** 生成 `scrypt$N$r$p$salt$hash` 格式的密码摘要 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = await derive(
    plain,
    salt,
    KEY_LENGTH,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
  );
  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt,
    derived.toString('hex'),
  ].join('$');
}

/** 校验明文密码；摘要格式非法时返回 false，不抛错 */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, rawCost, rawBlockSize, rawParallelization, salt, hash] = parts;
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  if (expected.length === 0 || expected.toString('hex') !== hash) return false;

  const cost = Number(rawCost);
  const blockSize = Number(rawBlockSize);
  const parallelization = Number(rawParallelization);
  if (!Number.isInteger(cost) || cost <= 0) return false;
  if (!Number.isInteger(blockSize) || blockSize <= 0) return false;
  if (!Number.isInteger(parallelization) || parallelization <= 0) return false;

  try {
    const actual = await derive(
      plain,
      salt,
      expected.length,
      cost,
      blockSize,
      parallelization,
    );
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
