/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { QueryDocumentSectionsDto } from './query-document-sections.dto';

/** 与 main.ts 的全局管道保持一致，用于验证请求契约 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});
const metadata: ArgumentMetadata = {
  type: 'query',
  metatype: QueryDocumentSectionsDto,
};

describe('QueryDocumentSectionsDto', () => {
  it('coerces cursor and limit from query strings', async () => {
    const dto = await pipe.transform({ cursor: '20', limit: '5' }, metadata);

    expect(dto).toMatchObject({ cursor: 20, limit: 5 });
  });

  it('defaults limit to ten when omitted', async () => {
    const dto = (await pipe.transform(
      {},
      metadata,
    )) as QueryDocumentSectionsDto;

    expect(dto.limit).toBe(10);
    expect(dto.cursor).toBeUndefined();
  });

  it('rejects a limit above fifty', async () => {
    await expect(pipe.transform({ limit: 51 }, metadata)).rejects.toThrow();
  });

  it('rejects a limit below one', async () => {
    await expect(pipe.transform({ limit: 0 }, metadata)).rejects.toThrow();
  });

  it('rejects a negative cursor', async () => {
    await expect(pipe.transform({ cursor: -1 }, metadata)).rejects.toThrow();
  });

  it('rejects a client supplied ownerId via forbidNonWhitelisted', async () => {
    await expect(
      pipe.transform({ ownerId: 'user_2' }, metadata),
    ).rejects.toThrow();
  });
});
