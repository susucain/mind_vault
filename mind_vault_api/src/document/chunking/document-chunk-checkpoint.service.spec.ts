import { DocumentChunkCheckpointService } from './document-chunk-checkpoint.service';
import { DocumentChunkEntity } from '../entities/document-chunk.entity';

function decode(buffer: Buffer): number[] {
  const copy = Buffer.from(buffer);
  return Array.from(
    new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4),
  );
}

describe('DocumentChunkCheckpointService', () => {
  it('returns null when no checkpoint rows exist for the version', async () => {
    const chunks = { find: jest.fn().mockResolvedValue([]) };
    const service = new DocumentChunkCheckpointService(chunks as never);

    await expect(
      service.loadComplete('user_1', 'doc_1', 1),
    ).resolves.toBeNull();
  });

  it('returns null when any row is still missing its embedding', async () => {
    const chunks = {
      find: jest.fn().mockResolvedValue([
        { chunkId: 'chunk_1', embedding: Buffer.from([0, 0, 0, 0]) },
        { chunkId: 'chunk_2', embedding: null },
      ]),
    };
    const service = new DocumentChunkCheckpointService(chunks as never);

    await expect(
      service.loadComplete('user_1', 'doc_1', 1),
    ).resolves.toBeNull();
  });

  it('rebuilds chunks with decoded embeddings when the checkpoint is complete', async () => {
    const encoded = Buffer.from(new Float32Array([0.25, -0.5]).buffer);
    const chunks = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'row_1',
          ownerId: 'user_1',
          documentId: 'doc_1',
          documentVersion: 1,
          sectionId: 'section_0001',
          chunkOrder: 0,
          chunkId: 'chunk_1',
          text: '正文',
          parentContext: '整节正文',
          titlePath: ['标题'],
          locator: { lineStart: 1 },
          embedding: encoded,
        },
      ]),
    };
    const service = new DocumentChunkCheckpointService(chunks as never);

    await expect(service.loadComplete('user_1', 'doc_1', 1)).resolves.toEqual([
      {
        chunkId: 'chunk_1',
        parentId: 'section_0001',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        sectionId: 'section_0001',
        chunkOrder: 0,
        titlePath: ['标题'],
        text: '正文',
        parentContext: '整节正文',
        locator: { lineStart: 1 },
        embedding: [0.25, -0.5],
      },
    ]);
    expect(chunks.find).toHaveBeenCalledWith({
      where: { ownerId: 'user_1', documentId: 'doc_1', documentVersion: 1 },
      order: { chunkOrder: 'ASC' },
    });
  });

  it('replaces the whole version and stores embeddings as float32 bytes', async () => {
    const inserted: DocumentChunkEntity[][] = [];
    const manager = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn((entity, rows: DocumentChunkEntity[]) => {
        inserted.push(rows);
        return Promise.resolve({ identifiers: rows });
      }),
    };
    const chunks = {
      manager: {
        transaction: jest.fn((run: (m: unknown) => Promise<void>) =>
          run(manager),
        ),
      },
    };
    const service = new DocumentChunkCheckpointService(chunks as never);

    await service.save([
      {
        chunkId: 'chunk_1',
        parentId: 'section_0001',
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 2,
        sectionId: 'section_0001',
        chunkOrder: 0,
        titlePath: ['标题'],
        text: '正文',
        parentContext: '整节正文',
        locator: { lineStart: 1 },
        embedding: [0.25, -0.5],
      },
    ]);

    expect(manager.delete).toHaveBeenCalledWith(DocumentChunkEntity, {
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 2,
    });
    expect(inserted).toHaveLength(1);
    const [row] = inserted[0];
    expect(row).toMatchObject({
      ownerId: 'user_1',
      documentId: 'doc_1',
      documentVersion: 2,
      chunkId: 'chunk_1',
      text: '正文',
    });
    expect(row.contentHash).toHaveLength(64);
    expect(decode(row.embedding as Buffer)).toEqual([0.25, -0.5]);
  });

  it('loads the chunk text with neighbor fragments for the graph worker（G1）', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({
        text: '正文',
        titlePath: ['A', 'B'],
        chunkOrder: 5,
        documentVersion: 1,
      })
      .mockResolvedValueOnce({ text: '上一段' })
      .mockResolvedValueOnce({ text: '下一段' });
    const service = new DocumentChunkCheckpointService({
      findOne,
    } as never);

    await expect(
      service.findGraphContext('user_1', 'doc_1', 'chunk_1'),
    ).resolves.toEqual({
      text: '正文',
      titlePath: ['A', 'B'],
      chunkOrder: 5,
      previousText: '上一段',
      nextText: '下一段',
    });
    // 邻居按 chunkOrder ± 1 取（同版本、同文档），跨章节也能衔接
    expect(findOne).toHaveBeenNthCalledWith(2, {
      where: {
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        chunkOrder: 4,
      },
      select: { text: true },
    });
    expect(findOne).toHaveBeenNthCalledWith(3, {
      where: {
        ownerId: 'user_1',
        documentId: 'doc_1',
        documentVersion: 1,
        chunkOrder: 6,
      },
      select: { text: true },
    });
  });

  it('returns null when the graph chunk has no checkpoint row', async () => {
    const service = new DocumentChunkCheckpointService({
      findOne: jest.fn().mockResolvedValue(null),
    } as never);

    await expect(
      service.findGraphContext('user_1', 'doc_1', 'chunk_1'),
    ).resolves.toBeNull();
  });
});
