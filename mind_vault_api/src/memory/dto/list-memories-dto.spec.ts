import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListMemoriesDto } from './list-memories.dto';

/** 走真实的 class-transformer + class-validator 链路，验证查询串的转换与边界 */
async function validateWith(
  query: Record<string, unknown>,
): Promise<ListMemoriesDto> {
  const instance = plainToInstance(ListMemoriesDto, query);
  const errors = await validate(instance);
  if (errors.length > 0) {
    throw new Error(
      Object.values(errors[0].constraints ?? {}).join(' / ') || '校验失败',
    );
  }
  return instance;
}

describe('ListMemoriesDto', () => {
  it('treats a blank or missing keyword as no filter', async () => {
    // `?q=` 若不置空，会变成 content LIKE '%%' 的无意义条件
    expect((await validateWith({ q: '' })).q).toBeUndefined();
    expect((await validateWith({ q: '   ' })).q).toBeUndefined();
    expect((await validateWith({})).q).toBeUndefined();
  });

  it('trims the keyword', async () => {
    const dto = await validateWith({ q: '  转岗  ' });

    expect(dto.q).toBe('转岗');
  });

  it('rejects an over-long keyword', async () => {
    await expect(validateWith({ q: 'a'.repeat(65) })).rejects.toThrow(
      '搜索关键词最多 64 个字符',
    );
  });

  it('casts the pagination params of a query string to numbers', async () => {
    const dto = await validateWith({ page: '2', pageSize: '50' });

    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(50);
  });

  it.each([
    [{ page: '0' }, '页码为 0'],
    [{ page: '-1' }, '页码为负'],
    [{ page: '1.5' }, '页码非整数'],
    [{ pageSize: '0' }, '每页条数为 0'],
    [{ pageSize: '101' }, '每页条数超过上限'],
  ])('rejects invalid pagination %o (%s)', async (query) => {
    await expect(validateWith(query)).rejects.toThrow();
  });

  it('rejects unknown enum values', async () => {
    await expect(validateWith({ status: 'DELETED' })).rejects.toThrow();
    await expect(validateWith({ kind: 'other' })).rejects.toThrow();
  });
});
