import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Not, Repository } from 'typeorm';
import { nextSnowflakeId } from '../../common/snowflake-id';
import { DocumentChunk } from './document-chunk';
import { DocumentChunkEntity } from '../entities/document-chunk.entity';

/** 向量以 float32 原始字节存 bytea，省体积又能无损还原 */
function encodeEmbedding(vector?: number[]): Buffer | null {
  if (!vector?.length) return null;
  const floats = new Float32Array(vector);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

function decodeEmbedding(value?: Buffer | null): number[] | undefined {
  if (!value?.length) return undefined;
  // 复制一份，避免 pg 返回的 Buffer 字节偏移不是 4 的倍数导致构造 Float32Array 抛错
  const copy = Buffer.from(value);
  const floats = new Float32Array(
    copy.buffer,
    copy.byteOffset,
    Math.floor(copy.byteLength / 4),
  );
  return Array.from(floats);
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

@Injectable()
export class DocumentChunkCheckpointService {
  constructor(
    @InjectRepository(DocumentChunkEntity)
    private readonly chunks: Repository<DocumentChunkEntity>,
  ) {}

  /**
   * 读取「完整」检查点：仅当该版本存在行且全部 embedding 非空时返回，
   * 否则返回 null，让调用方回落到完整链路（parsing → chunking → embedding）。
   */
  async loadComplete(
    ownerId: string,
    documentId: string,
    documentVersion: number,
  ): Promise<DocumentChunk[] | null> {
    const rows = await this.chunks.find({
      where: { ownerId, documentId, documentVersion },
      order: { chunkOrder: 'ASC' },
    });
    if (rows.length === 0) return null;
    if (rows.some((row) => !row.embedding?.length)) return null;
    return rows.map((row) => this.toChunk(row));
  }

  /** 落检查点：整版本替换，保证重放幂等 */
  async save(chunks: DocumentChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const { ownerId, documentId, documentVersion } = chunks[0];
    await this.chunks.manager.transaction(async (manager) => {
      await manager.delete(DocumentChunkEntity, {
        ownerId,
        documentId,
        documentVersion,
      });
      await manager.insert(
        DocumentChunkEntity,
        chunks.map((chunk) => ({
          id: nextSnowflakeId(),
          ownerId: chunk.ownerId,
          documentId: chunk.documentId,
          documentVersion: chunk.documentVersion,
          sectionId: chunk.sectionId,
          chunkOrder: chunk.chunkOrder,
          chunkId: chunk.chunkId,
          text: chunk.text,
          parentContext: chunk.parentContext,
          titlePath: chunk.titlePath,
          locator: chunk.locator,
          embedding: encodeEmbedding(chunk.embedding),
          contentHash: hashText(chunk.text),
        })),
      );
    });
  }

  /** 图谱 worker 按 chunkId 取正文（图谱任务行已不再存全文） */
  async findTextByChunkId(
    ownerId: string,
    documentId: string,
    chunkId: string,
  ): Promise<string | null> {
    const row = await this.chunks.findOne({
      where: { ownerId, documentId, chunkId },
      select: { text: true },
    });
    return row?.text ?? null;
  }

  /** 重建完成后旧版本检查点不再需要，清掉避免无限累积 */
  async deleteOtherVersions(
    ownerId: string,
    documentId: string,
    keepVersion: number,
  ): Promise<void> {
    await this.chunks.delete({
      ownerId,
      documentId,
      documentVersion: Not(keepVersion),
    });
  }

  async deleteByDocument(ownerId: string, documentId: string): Promise<void> {
    await this.chunks.delete({ ownerId, documentId });
  }

  private toChunk(row: DocumentChunkEntity): DocumentChunk {
    return {
      chunkId: row.chunkId,
      parentId: row.sectionId,
      ownerId: row.ownerId,
      documentId: row.documentId,
      documentVersion: row.documentVersion,
      sectionId: row.sectionId,
      chunkOrder: row.chunkOrder,
      titlePath: row.titlePath ?? [],
      text: row.text,
      parentContext: row.parentContext,
      locator: row.locator,
      embedding: decodeEmbedding(row.embedding),
    };
  }
}
