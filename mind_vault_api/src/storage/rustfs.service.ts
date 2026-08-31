import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class RustfsService {
  private readonly logger = new Logger(RustfsService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady = false;

  constructor(private readonly config: ConfigService) {
    this.bucket =
      process.env.S3_BUCKET ??
      process.env.RUSTFS_BUCKET ??
      config.get<string>('S3_BUCKET') ??
      config.get<string>('RUSTFS_BUCKET') ??
      config.get<string>('rustfs.bucket') ??
      'mind-vault';
    this.client = new S3Client({
      endpoint:
        process.env.S3_ENDPOINT ??
        process.env.RUSTFS_ENDPOINT ??
        config.get<string>('S3_ENDPOINT') ??
        config.get<string>('RUSTFS_ENDPOINT') ??
        config.get<string>('rustfs.endpoint') ??
        'http://localhost:9000',
      region:
        process.env.S3_REGION ??
        process.env.RUSTFS_REGION ??
        config.get<string>('S3_REGION') ??
        config.get<string>('RUSTFS_REGION') ??
        'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId:
          process.env.S3_ACCESS_KEY ??
          process.env.RUSTFS_ACCESS_KEY ??
          config.get<string>('S3_ACCESS_KEY') ??
          config.get<string>('RUSTFS_ACCESS_KEY') ??
          'rustfsadmin',
        secretAccessKey:
          process.env.S3_SECRET_KEY ??
          process.env.RUSTFS_SECRET_KEY ??
          config.get<string>('S3_SECRET_KEY') ??
          config.get<string>('RUSTFS_SECRET_KEY') ??
          'rustfsadmin',
      },
    });
    this.logger.log(
      `RustFS configured: endpoint=${config.get<string>('S3_ENDPOINT') ?? config.get<string>('RUSTFS_ENDPOINT') ?? config.get<string>('rustfs.endpoint')}, bucket=${this.bucket}`,
    );
  }

  isEnabled(): boolean {
    return (
      this.config.get<boolean>('STORAGE_ENABLED') ??
      this.config.get<boolean>('RUSTFS_ENABLED') ??
      this.config.get<boolean>('rustfs.enabled') ??
      this.config.get<string>('S3_ENDPOINT') !== undefined
    );
  }

  async uploadBytes(
    bytes: Buffer,
    options: { fileName: string; contentType?: string; prefix?: string },
  ): Promise<string> {
    await this.ensureBucket();
    const key = `${options.prefix ?? 'documents'}/${Date.now()}-${options.fileName}`;
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

  private async ensureBucket() {
    if (!this.isEnabled() || this.bucketReady) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    this.bucketReady = true;
  }
}
