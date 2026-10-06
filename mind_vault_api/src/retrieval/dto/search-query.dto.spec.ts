/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { SearchQueryDto } from './search-query.dto';

/** 与 main.ts 的全局管道保持一致，用于验证请求体契约 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});
const metadata: ArgumentMetadata = { type: 'body', metatype: SearchQueryDto };

describe('SearchQueryDto', () => {
  it('accepts a keyword search and splits comma separated filters', async () => {
    const dto = await pipe.transform(
      {
        query: '消息队列',
        mode: 'keyword',
        datasetIds: 'd1,d2',
        entityNames: ['Kafka'],
        page: '2',
        pageSize: '20',
      },
      metadata,
    );

    expect(dto).toMatchObject({
      query: '消息队列',
      mode: 'keyword',
      datasetIds: ['d1', 'd2'],
      entityNames: ['Kafka'],
      page: 2,
      pageSize: 20,
    });
  });

  it('rejects an unknown retrieval mode', async () => {
    await expect(
      pipe.transform({ query: 'x', mode: 'fuzzy' }, metadata),
    ).rejects.toThrow();
  });

  it('rejects pageSize above the upper bound', async () => {
    await expect(
      pipe.transform({ query: 'x', mode: 'keyword', pageSize: 21 }, metadata),
    ).rejects.toThrow();
  });

  it('rejects maxHops larger than three', async () => {
    await expect(
      pipe.transform({ query: 'x', mode: 'graph', maxHops: 4 }, metadata),
    ).rejects.toThrow();
  });

  it('rejects a non ISO8601 time range', async () => {
    await expect(
      pipe.transform(
        { query: 'x', mode: 'keyword', from: '2026/01/01' },
        metadata,
      ),
    ).rejects.toThrow();
  });

  it('rejects a client supplied ownerId via forbidNonWhitelisted', async () => {
    await expect(
      pipe.transform(
        { query: 'x', mode: 'keyword', ownerId: 'user_2' },
        metadata,
      ),
    ).rejects.toThrow();
  });

  it('caps entityNames at ten entries', async () => {
    const entityNames = Array.from({ length: 11 }, (_, index) => `e${index}`);

    await expect(
      pipe.transform({ query: 'x', mode: 'hybrid', entityNames }, metadata),
    ).rejects.toThrow();
  });
});
