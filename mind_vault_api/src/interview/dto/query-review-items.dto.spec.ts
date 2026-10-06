/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { QueryReviewItemsDto } from './query-review-items.dto';

describe('QueryReviewItemsDto', () => {
  it('rejects a page number larger than 10000', async () => {
    const dto = new QueryReviewItemsDto();
    dto.page = 10_001;

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'page',
          constraints: expect.objectContaining({ max: expect.any(String) }),
        }),
      ]),
    );
  });

  it('accepts the ALL status for the combined filter', async () => {
    const dto = new QueryReviewItemsDto();
    dto.status = 'ALL';

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
