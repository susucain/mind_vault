/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { DatasetService } from './dataset.service';

describe('DatasetService', () => {
  it('creates a dataset for the authenticated owner', async () => {
    const repository = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'dataset_1', ...input })),
    };
    const service = new DatasetService(repository as never);

    await expect(
      service.create('user_1', {
        name: '后端面试',
        description: '面试资料',
      }),
    ).resolves.toMatchObject({
      id: expect.any(String),
      ownerId: 'user_1',
      name: '后端面试',
      description: '面试资料',
      deleted: false,
    });
  });

  it('only returns datasets owned by the authenticated user', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest
        .fn()
        .mockResolvedValue([[{ id: 'dataset_1', ownerId: 'user_1' }], 1]),
    };
    const repository = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new DatasetService(repository as never);

    await service.findAll('user_1', { page: 1, pageSize: 20 });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'dataset.owner_id = :ownerId',
      { ownerId: 'user_1' },
    );
  });
});
