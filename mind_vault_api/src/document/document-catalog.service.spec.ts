import { NotFoundException } from '@nestjs/common';
import { DocumentCatalogService } from './document-catalog.service';
import { ParsedSection } from './parser/parsed-document';

function mockContent(content: {
  content?: string;
  pageCount?: number;
  sections?: Partial<ParsedSection>[];
}) {
  return {
    findOne: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        content: content.content ?? '',
        pageCount: content.pageCount ?? 0,
        sections: content.sections ?? [],
      }),
    }),
  };
}

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

  it('returns an outline with heading metadata but without section bodies', async () => {
    const documents = {
      findOne: jest.fn().mockResolvedValue({ id: 'doc_1', title: '设计文档' }),
    };
    const contents = mockContent({
      content: '全文',
      pageCount: 6,
      sections: [
        {
          sectionId: 'section_0001',
          heading: '概述',
          text: '概述正文',
          order: 0,
          locator: { page: 1 },
        },
        {
          sectionId: 'section_0002',
          heading: '细节',
          text: '细节正文',
          order: 1,
          locator: { page: 2 },
        },
      ],
    });
    const service = new DocumentCatalogService(
      documents as never,
      contents as never,
      {} as never,
    );

    await expect(service.findOutline('user_1', 'doc_1')).resolves.toEqual({
      documentId: 'doc_1',
      title: '设计文档',
      pageCount: 6,
      totalSections: 2,
      sections: [
        {
          sectionId: 'section_0001',
          heading: '概述',
          order: 0,
          locator: { page: 1 },
        },
        {
          sectionId: 'section_0002',
          heading: '细节',
          order: 1,
          locator: { page: 2 },
        },
      ],
    });
  });

  it('paginates sections by the order cursor', async () => {
    const documents = {
      findOne: jest.fn().mockResolvedValue({ id: 'doc_1', title: '资料' }),
    };
    const contents = mockContent({
      sections: Array.from({ length: 5 }, (_, index) => ({
        sectionId: `section_${String(index + 1).padStart(4, '0')}`,
        heading: `H${index}`,
        text: `正文 ${index}`,
        order: index,
        locator: { page: index + 1 },
      })),
    });
    const service = new DocumentCatalogService(
      documents as never,
      contents as never,
      {} as never,
    );

    const first = await service.findSections('user_1', 'doc_1', { limit: 2 });
    expect(first.items.map((item) => item.order)).toEqual([0, 1]);
    expect(first.nextCursor).toBe(1);
    expect(first.total).toBe(5);

    const second = await service.findSections('user_1', 'doc_1', {
      cursor: 1,
      limit: 2,
    });
    expect(second.items.map((item) => item.order)).toEqual([2, 3]);
    expect(second.nextCursor).toBe(3);

    const last = await service.findSections('user_1', 'doc_1', {
      cursor: 3,
      limit: 2,
    });
    expect(last.items.map((item) => item.order)).toEqual([4]);
    expect(last.nextCursor).toBeNull();
  });

  it('splits an oversized section by the character budget', async () => {
    const documents = {
      findOne: jest.fn().mockResolvedValue({ id: 'doc_1', title: '资料' }),
    };
    const contents = mockContent({
      sections: [
        {
          sectionId: 'section_0001',
          text: 'a'.repeat(2500),
          order: 0,
          locator: {},
        },
      ],
    });
    const service = new DocumentCatalogService(
      documents as never,
      contents as never,
      {} as never,
    );

    const result = await service.findSections('user_1', 'doc_1', { limit: 10 });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.text.length)).toEqual([2000, 500]);
    expect(
      result.items.every((item) => item.sectionId === 'section_0001'),
    ).toBe(true);
    expect(result.nextCursor).toBeNull();
  });

  it('falls back to content chunks when a document has no sections', async () => {
    const documents = {
      findOne: jest.fn().mockResolvedValue({ id: 'doc_1', title: '资料' }),
    };
    const contents = mockContent({ content: 'b'.repeat(3000), sections: [] });
    const service = new DocumentCatalogService(
      documents as never,
      contents as never,
      {} as never,
    );

    const outline = await service.findOutline('user_1', 'doc_1');
    expect(outline.totalSections).toBe(2);

    const result = await service.findSections('user_1', 'doc_1', { limit: 1 });
    expect(result.total).toBe(2);
    expect(result.items[0].text.length).toBe(2000);
    expect(result.nextCursor).toBe(0);
  });

  it('rejects pagination for a document owned by another user', async () => {
    const documents = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new DocumentCatalogService(
      documents as never,
      mockContent({}) as never,
      {} as never,
    );

    await expect(
      service.findSections('user_2', 'doc_1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('serves an allowlisted asset key with the inferred content type', async () => {
    const storage = {
      isEnabled: jest.fn().mockReturnValue(true),
      downloadBytes: jest.fn().mockResolvedValue(Buffer.from('png-bytes')),
    };
    const service = new DocumentCatalogService(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      storage as never,
    );

    const asset = await service.readAsset(
      'pdf-images/1790182552129-pdf_img_p1_0.png',
    );

    expect(storage.downloadBytes).toHaveBeenCalledWith(
      'pdf-images/1790182552129-pdf_img_p1_0.png',
    );
    expect(asset.contentType).toBe('image/png');
    expect(asset.body.toString()).toBe('png-bytes');
  });

  it('rejects asset keys outside the allowlist or containing traversal', async () => {
    const storage = {
      isEnabled: jest.fn().mockReturnValue(true),
      downloadBytes: jest.fn(),
    };
    const service = new DocumentCatalogService(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      storage as never,
    );

    await expect(
      service.readAsset('documents/secret.pdf'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.readAsset('pdf-images/../secret.png'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.downloadBytes).not.toHaveBeenCalled();
  });

  it('rejects assets when object storage is unavailable', async () => {
    const storage = {
      isEnabled: jest.fn().mockReturnValue(false),
      downloadBytes: jest.fn(),
    };
    const service = new DocumentCatalogService(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      storage as never,
    );

    await expect(service.readAsset('pdf-images/a.png')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps a missing storage object to not found', async () => {
    const storage = {
      isEnabled: jest.fn().mockReturnValue(true),
      downloadBytes: jest.fn().mockRejectedValue(new Error('NoSuchKey')),
    };
    const service = new DocumentCatalogService(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      storage as never,
    );

    await expect(
      service.readAsset('pdf-images/missing.png'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
