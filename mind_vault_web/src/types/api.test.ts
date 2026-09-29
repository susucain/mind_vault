import { describe, expectTypeOf, it } from 'vitest';
import type { Upload, UploadItem } from './api';

describe('upload API types', () => {
  it('exports Upload as the public upload item type', () => {
    expectTypeOf<Upload>().toEqualTypeOf<UploadItem>();
  });
});
