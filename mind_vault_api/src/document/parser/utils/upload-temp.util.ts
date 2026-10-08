import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 流式落盘（U4/F4）的临时目录与文件工具。
 *
 * 上传时 multer 把请求体直接写到磁盘，服务端不再把 100MB 文件整块放进内存；
 * 魔数核对只读文件头、内容指纹流式计算，镜像与对象存储也按需读取/流式上传。
 */
export const UPLOAD_TEMP_DIR =
  process.env.UPLOAD_TEMP_DIR ?? join(tmpdir(), 'mind-vault-uploads');

/** 残留临时文件的清理阈值：超过此时长仍未落库的文件视为崩溃残留 */
const STALE_TEMP_FILE_MS = 60 * 60 * 1000;

export async function ensureUploadTempDir(): Promise<void> {
  await mkdir(UPLOAD_TEMP_DIR, { recursive: true });
}

/** 只读取文件头若干字节，用于魔数核对（避免把大文件读进内存） */
export async function readFileHead(
  path: string,
  maxBytes: number,
): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** 流式计算 sha256，用于内容指纹（U3） */
export function hashFileSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** 清理单个临时文件；失败只记录，不阻断请求 */
export async function removeFileQuietly(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // 临时文件清理失败不影响上传结果，交由启动时的残留清理兜底
  }
}

/**
 * 启动时清理残留临时文件。
 * 只删除超过 `maxAgeMs` 的文件，避免误删 API 与 worker 同时在跑的进行中上传。
 */
export async function cleanupUploadTempDir(
  maxAgeMs = STALE_TEMP_FILE_MS,
): Promise<number> {
  let removed = 0;
  try {
    const entries = await readdir(UPLOAD_TEMP_DIR);
    const cutoff = Date.now() - maxAgeMs;
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(UPLOAD_TEMP_DIR, entry);
        try {
          const info = await stat(path);
          if (info.isFile() && info.mtimeMs < cutoff) {
            await rm(path, { force: true });
            removed += 1;
          }
        } catch {
          // 文件在此期间被删除或不可读，忽略
        }
      }),
    );
  } catch {
    // 临时目录尚未创建时无需清理
  }
  return removed;
}
