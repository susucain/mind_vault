import { DocumentCatalogService } from './document-catalog.service';

describe('DocumentCatalogService', () => {
  it('filters documents by owner and dataset association', async () => {
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const documents = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new DocumentCatalogService(documents as never, {} as never);

    await service.findAll('user_1', {
      datasetId: 'dataset_1',
      page: 1,
      pageSize: 20,
    });

    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      'kh_dataset_document',
      'datasetDocument',
      'datasetDocument.document_id = doc.id AND datasetDocument.owner_id = :ownerId',
      { ownerId: 'user_1' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'datasetDocument.dataset_id = :datasetId',
      { datasetId: 'dataset_1' },
    );
  });
});
