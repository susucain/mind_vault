/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { DatasetService } from './dataset.service';

describe('DatasetService', () => {
  it('creates a dataset for the authenticated owner', async () => {
    const repository = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({ id: 'dataset_1', ...input })),
    };
    const service = new DatasetService(
      repository as never,
      { createQueryBuilder: jest.fn() } as never,
    );

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
    const datasetDocuments = {
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };
    const service = new DatasetService(
      repository as never,
      datasetDocuments as never,
    );

    await service.findAll('user_1', { page: 1, pageSize: 20 });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'dataset.owner_id = :ownerId',
      { ownerId: 'user_1' },
    );
  });

  it('attaches the live document count to each dataset', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          { id: 'dataset_1', ownerId: 'user_1' },
          { id: 'dataset_2', ownerId: 'user_1' },
        ],
        2,
      ]),
    };
    const repository = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const documentQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ datasetId: 'dataset_1', count: '3' }]),
    };
    const datasetDocuments = {
      createQueryBuilder: jest.fn().mockReturnValue(documentQueryBuilder),
    };
    const service = new DatasetService(
      repository as never,
      datasetDocuments as never,
    );

    const result = await service.findAll('user_1', { page: 1, pageSize: 20 });

    expect(result.items).toEqual([
      { id: 'dataset_1', ownerId: 'user_1', documentCount: 3 },
      { id: 'dataset_2', ownerId: 'user_1', documentCount: 0 },
    ]);
    expect(documentQueryBuilder.andWhere).toHaveBeenCalledWith(
      'document.deleted = false',
    );
  });
});
