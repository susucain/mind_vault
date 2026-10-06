import { DocumentCatalogService } from './document-catalog.service';

describe('DocumentCatalogService', () => {
  it('filters documents by owner and dataset association', async () => {
    const queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const documents = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new DocumentCatalogService(
      documents as never,
      {} as never,
      {} as never,
    );

    await service.findAll('user_1', {
      datasetId: 'dataset_1',
      page: 1,
      pageSize: 20,
    });

    expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
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

  it('returns parsed sections and page count with document content', async () => {
    const documents = {
      findOne: jest.fn().mockResolvedValue({
        id: 'doc_1',
        ownerId: 'user_1',
      }),
    };
    const contents = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          content: '原文',
          sections: [{ sectionId: 'section_1', text: '原文' }],
          pageCount: 3,
        }),
      }),
    };
    const service = new DocumentCatalogService(
      documents as never,
      contents as never,
      {} as never,
    );

    await expect(service.findOne('user_1', 'doc_1')).resolves.toMatchObject({
      content: '原文',
      pageCount: 3,
      sections: [{ sectionId: 'section_1' }],
    });
  });

  it('includes the latest ingestion status for each listed document', async () => {
    const queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({
        raw: [{ doc_id: 'doc_1', datasetId: null, datasetName: null }],
        entities: [{ id: 'doc_1', title: '资料' }],
      }),
      getCount: jest.fn().mockResolvedValue(1),
    };
    const documents = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const jobs = {
      find: jest.fn().mockResolvedValue([
        {
          documentId: 'doc_1',
          status: 'FAILED',
          currentStage: 'parsing',
          errorMessage: '文件格式错误',
        },
      ]),
    };
    const service = new DocumentCatalogService(
      documents as never,
      {} as never,
      jobs as never,
    );

    await expect(
      service.findAll('user_1', { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [
        {
          id: 'doc_1',
          ingestionStatus: 'FAILED',
          ingestionStage: 'parsing',
          ingestionErrorMessage: '文件格式错误',
        },
      ],
    });
  });
});
