import { describe, expectTypeOf, it } from 'vitest';
import type { PageResult, Upload, UploadItem } from './api';

describe('upload API types', () => {
  it('exports Upload as the public upload item type', () => {
    expectTypeOf<Upload>().toEqualTypeOf<UploadItem>();
  });

  it('does not require the backend to provide hasNext', () => {
    const pageResult: PageResult<UploadItem> = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    };

    expectTypeOf(pageResult).toMatchTypeOf<PageResult<UploadItem>>();
  });
});
