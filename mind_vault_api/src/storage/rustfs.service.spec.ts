import { resolveObjectStorageConfig } from './rustfs.service';

describe('object storage configuration', () => {
  it('prefers Alibaba Cloud OSS variables over RustFS compatibility variables', () => {
    expect(
      resolveObjectStorageConfig({
        OSS_ACCESS_KEY_ID: 'oss-access',
        OSS_ACCESS_KEY_SECRET: 'oss-secret',
        OSS_REGION: 'oss-cn-hangzhou',
        OSS_BUCKET_NAME: 'oss-ai-bucket',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_ACCESS_KEY: 'rustfs-access',
        S3_SECRET_KEY: 'rustfs-secret',
        S3_BUCKET: 'rustfs-bucket',
      }),
    ).toEqual({
      bucket: 'oss-ai-bucket',
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
      region: 'oss-cn-hangzhou',
      accessKeyId: 'oss-access',
      secretAccessKey: 'oss-secret',
      forcePathStyle: false,
      autoCreateBucket: false,
      provider: 'oss',
    });
  });
});
