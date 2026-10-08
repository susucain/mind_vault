import { createReadStream } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface ObjectStorageEnvironment {
  [key: string]: string | undefined;
}

export interface ObjectStorageConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  autoCreateBucket: boolean;
  provider: 'oss' | 's3';
}

export function resolveObjectStorageConfig(
  env: ObjectStorageEnvironment,
): ObjectStorageConfig {
  const ossConfigured = Boolean(
    env.OSS_BUCKET_NAME ||
    env.OSS_ACCESS_KEY_ID ||
    env.OSS_ACCESS_KEY_SECRET ||
    env.OSS_ENDPOINT,
  );

  if (ossConfigured) {
    const region = env.OSS_REGION ?? 'oss-cn-hangzhou';
    return {
      bucket: env.OSS_BUCKET_NAME ?? 'mind-vault',
      endpoint: env.OSS_ENDPOINT ?? `https://${region}.aliyuncs.com`,
      region,
      accessKeyId: env.OSS_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.OSS_ACCESS_KEY_SECRET ?? '',
      forcePathStyle: false,
      autoCreateBucket: false,
      provider: 'oss',
    };
  }

  return {
    bucket: env.S3_BUCKET ?? env.RUSTFS_BUCKET ?? 'mind-vault',
    endpoint: env.S3_ENDPOINT ?? env.RUSTFS_ENDPOINT ?? 'http://localhost:9000',
    region: env.S3_REGION ?? env.RUSTFS_REGION ?? 'us-east-1',
    accessKeyId: env.S3_ACCESS_KEY ?? env.RUSTFS_ACCESS_KEY ?? 'rustfsadmin',
    secretAccessKey:
      env.S3_SECRET_KEY ?? env.RUSTFS_SECRET_KEY ?? 'rustfsadmin',
    forcePathStyle: true,
    autoCreateBucket: true,
    provider: 's3',
  };
}

@Injectable()
export class RustfsService {
  private readonly logger = new Logger(RustfsService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly autoCreateBucket: boolean;
  private bucketReady = false;

  constructor(private readonly config: ConfigService) {
    const configured = (name: string) =>
      config.get<string>(name) ?? process.env[name];
    const storage = resolveObjectStorageConfig({
      ...process.env,
      OSS_ENDPOINT: configured('OSS_ENDPOINT'),
      OSS_ACCESS_KEY_ID: configured('OSS_ACCESS_KEY_ID'),
      OSS_ACCESS_KEY_SECRET: configured('OSS_ACCESS_KEY_SECRET'),
      OSS_REGION: configured('OSS_REGION'),
      OSS_BUCKET_NAME: configured('OSS_BUCKET_NAME'),
      S3_ENDPOINT: configured('S3_ENDPOINT'),
      S3_ACCESS_KEY: configured('S3_ACCESS_KEY'),
      S3_SECRET_KEY: configured('S3_SECRET_KEY'),
      S3_BUCKET: configured('S3_BUCKET'),
      RUSTFS_ENDPOINT: configured('RUSTFS_ENDPOINT'),
      RUSTFS_ACCESS_KEY: configured('RUSTFS_ACCESS_KEY'),
      RUSTFS_SECRET_KEY: configured('RUSTFS_SECRET_KEY'),
      RUSTFS_BUCKET: configured('RUSTFS_BUCKET'),
    });
    this.bucket = storage.bucket;
    this.autoCreateBucket = storage.autoCreateBucket;
    this.client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
    this.logger.log(
      `Object storage configured: provider=${storage.provider}, endpoint=${storage.endpoint}, bucket=${this.bucket}`,
    );
  }

  isEnabled(): boolean {
    return (
      this.config.get<boolean>('STORAGE_ENABLED') ??
      this.config.get<boolean>('RUSTFS_ENABLED') ??
      this.config.get<boolean>('rustfs.enabled') ??
      (this.config.get<string>('OSS_BUCKET_NAME') !== undefined ||
        this.config.get<string>('S3_ENDPOINT') !== undefined)
    );
  }

  /**
   * 上传字节。`key` 为显式对象 key（如内容哈希命名的资产，A1），
   * 优先级高于 `prefix` + `fileName` 的自动拼接。
   */
  async uploadBytes(
    bytes: Buffer,
    options: {
      fileName?: string;
      contentType?: string;
      prefix?: string;
      key?: string;
    },
  ): Promise<string> {
    await this.ensureBucket();
    const key = options.key ?? this.autoKey(options);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: options.contentType,
      }),
    );
    this.logger.debug(
      `RustFS upload completed: bucket=${this.bucket}, key=${key}, bytes=${bytes.length}`,
    );
    return key;
  }

  /**
   * 从本地文件流式上传，避免把整份文件读进内存（U4 流式落盘的配套）。
   * `size` 用于设置 ContentLength，部分 S3 兼容实现不接受未知长度的分块上传。
   */
  async uploadFile(
    filePath: string,
    options: {
      fileName: string;
      contentType?: string;
      prefix?: string;
      size?: number;
    },
  ): Promise<string> {
    await this.ensureBucket();
    const key = this.autoKey(options);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: options.contentType,
        ContentLength: options.size,
      }),
    );
    this.logger.debug(
      `RustFS streaming upload completed: bucket=${this.bucket}, key=${key}, bytes=${options.size ?? 'unknown'}`,
    );
    return key;
  }

  async downloadBytes(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error(`RustFS object is empty: ${key}`);
    const bytes = await response.Body.transformToByteArray();
    this.logger.debug(
      `RustFS download completed: bucket=${this.bucket}, key=${key}`,
    );
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * 按前缀批量删除（资产回收，A1）：`documents/{ownerId}/{documentId}/` 下所有对象。
   * 返回实际删除的对象数。
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key));
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
        deleted += keys.length;
      }
      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return deleted;
  }

  /** `prefix/日期-文件名` 的默认 key 拼接（显式 key 未提供时使用） */
  private autoKey(options: { prefix?: string; fileName?: string }): string {
    if (!options.fileName) {
      throw new Error('上传对象缺少 fileName 或显式 key');
    }
    return `${options.prefix ?? 'documents'}/${Date.now()}-${options.fileName}`;
  }

  private async ensureBucket() {
    if (!this.isEnabled() || this.bucketReady) return;
    if (this.autoCreateBucket) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
      }
    } else {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    }
    this.bucketReady = true;
  }
}
