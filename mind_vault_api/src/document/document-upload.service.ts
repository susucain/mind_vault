import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DatasetService } from '../dataset/dataset.service';
import {
  DocumentIngestionJobEntity,
  IngestionJobOperation,
  IngestionJobStatus,
} from './entities/document-ingestion-job.entity';
import { DocumentEntity } from './entities/document.entity';
import { DatasetDocumentEntity } from '../dataset/entities/dataset-document.entity';
import {
  DocumentContent,
  DocumentContentDocument,
} from './schemas/document-content.schema';
import { RustfsService } from '../storage/rustfs.service';
import { DocumentPipelinePublisher } from '../mq/document-pipeline.publisher';
import {
  decodeUploadFilename,
  getExtension,
  titleFromFilename,
} from './parser/utils/markdown.util';
import { matchesFileSignature } from './parser/utils/file-signature';
import { FileParserService } from './parser/file-parser.service';
import { nextSnowflakeId } from '../common/snowflake-id';
import { DocumentGraphTaskService } from './graph/document-graph-task.service';
import { DocumentStatus } from './document-status';

const MAX_SOURCE_BYTES_MIRROR = 8 * 1024 * 1024;

@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);

  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
    @InjectModel(DocumentContent.name)
    private readonly contentModel: Model<DocumentContentDocument>,
    @InjectRepository(DocumentIngestionJobEntity)
    private readonly jobRepository: Repository<DocumentIngestionJobEntity>,
    private readonly storage: RustfsService,
    private readonly publisher: DocumentPipelinePublisher,
    private readonly datasets: DatasetService,
    private readonly parser: FileParserService,
    private readonly graphTasks?: DocumentGraphTaskService,
  ) {}

  /** 当前可上传的扩展名清单（soffice 不可用时不含老格式），供三端共用 */
  supportedFormats(): { extensions: string[] } {
    return { extensions: this.parser.availableExtensions() };
  }

  async upload(
    ownerId: string,
    file: {
      originalname: string;
      mimetype?: string;
      size: number;
      buffer: Buffer;
    },
    datasetId: string,
    metadata: {
      tags?: string;
      remark?: string;
      sourceFileName?: string;
      graphEnabled?: boolean;
      /** 幂等键：客户端超时重传时沿用同一值，命中则返回既有文档 */
      idempotencyKey?: string;
    } = {},
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('文件不能为空');
    }
    const idempotencyKey = metadata.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existing = await this.findByUploadKey(ownerId, idempotencyKey);
      if (existing) {
        this.logger.log(
          `命中上传幂等键，返回既有文档：ownerId=${ownerId}, documentId=${existing.documentId}`,
        );
        return existing;
      }
    }

    const originalname =
      metadata.sourceFileName?.trim() ||
      decodeUploadFilename(file.originalname);
    const extension = getExtension(originalname);
    if (!this.parser.availableExtensions().includes(extension)) {
      throw new BadRequestException(
        `不支持的文件格式: ${extension || '(无扩展名)'}，当前支持 ${this.parser.supportedList()}`,
      );
    }
    if (!matchesFileSignature(extension, file.buffer)) {
      throw new BadRequestException({
        message: `文件内容与扩展名 .${extension} 不匹配，请确认文件未被改名`,
        error: 'FILE_TYPE_MISMATCH',
      });
    }
    await this.datasets.findOne(ownerId, datasetId);

    const documentId = nextSnowflakeId();
    const fileKey = this.storage.isEnabled()
      ? await this.storage.uploadBytes(file.buffer, {
          fileName: `${documentId}-${originalname}`,
          contentType: file.mimetype,
          prefix: `users/${ownerId}/documents`,
        })
      : null;
    const shouldMirrorSourceBytes =
      file.buffer.length <= MAX_SOURCE_BYTES_MIRROR &&
      (!fileKey || process.env.STORAGE_MIRROR_SOURCE_BYTES === 'true');
    if (!fileKey && !shouldMirrorSourceBytes) {
      throw new BadRequestException('超过 8 MiB 的文件需要启用对象存储');
    }

    const content = await this.contentModel.create({
      documentId,
      content: '',
      contentLength: 0,
      contentSummary: '',
      version: 1,
      deleted: false,
      sourceBytes: shouldMirrorSourceBytes ? file.buffer : undefined,
      sourceMimeType: file.mimetype ?? 'application/octet-stream',
    });
    const document = this.em.create(DocumentEntity, {
      id: documentId,
      ownerId,
      title: titleFromFilename(originalname),
      contentId: String(content._id),
      tags: metadata.tags,
      remark: metadata.remark,
      sourceFileName: originalname,
      sourceFileKey: fileKey,
      sourceFileSize: String(file.size),
      sourceFileExtension: extension,
      status: DocumentStatus.Processing,
      wordCount: 0,
      isPublic: false,
      graphEnabled: metadata.graphEnabled ?? false,
      uploadKey: idempotencyKey ?? null,
      deleted: false,
    });
    let savedDocument: DocumentEntity;
    try {
      savedDocument = await this.em.save(document);
    } catch (error) {
      // 并发重传：两个请求都通过了前置查询，唯一索引 (owner_id, upload_key) 兜底
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByUploadKey(ownerId, idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }

    const relation = this.em.create(DatasetDocumentEntity, {
      datasetId,
      documentId,
      ownerId,
    });
    await this.em.save(relation);

    const job = this.jobRepository.create({
      id: nextSnowflakeId(),
      ownerId,
      documentId,
      documentVersion: 1,
      operation: IngestionJobOperation.Index,
      status: IngestionJobStatus.Uploaded,
      currentStage: 'uploaded',
      retryCount: 0,
    });
    const savedJob = await this.jobRepository.save(job);
    try {
      await this.publisher.publishIndex({
        jobId: savedJob.id,
        ownerId,
        documentId,
        documentVersion: 1,
        operation: 'index',
      });
    } catch (error) {
      // 投递失败不阻断请求：文档与 job 已落库，交由 stale 扫描重投或用户手动重试
      this.logger.error(
        `文档索引投递失败，保留任务等待重投：documentId=${documentId}, jobId=${savedJob.id}, error=${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.logger.log(
      `文档上传成功，等待索引：ownerId=${ownerId}, documentId=${documentId}, jobId=${savedJob.id}`,
    );
    return {
      documentId: savedDocument.id,
      jobId: savedJob.id,
      title: savedDocument.title,
      fileName: originalname,
      fileExtension: extension,
      fileSize: file.size,
      fileKey,
      graphEnabled: savedDocument.graphEnabled,
      status: IngestionJobStatus.Uploaded,
    };
  }

  async status(ownerId: string, documentId: string) {
    const job = await this.jobRepository.findOne({
      where: { ownerId, documentId },
      order: { createdAt: 'DESC' },
    });
    if (!job) throw new BadRequestException('未找到文档处理任务');
    const document = await this.em.findOne(DocumentEntity, {
      where: { id: documentId, ownerId, deleted: false },
    });
    const graphEnabled = document?.graphEnabled ?? false;
    const graph = graphEnabled
      ? ((await this.graphTasks?.getProgress(
          ownerId,
          documentId,
          job.documentVersion,
        )) ?? null)
      : null;
    const stageProgress = progressOf(job);
    return {
      documentId,
      jobId: job.id,
      status: job.status,
      currentStage: job.currentStage,
      retryCount: job.retryCount,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      stageProgress,
      graphEnabled,
      graph,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async retry(ownerId: string, documentId: string) {
    const job = await this.jobRepository.findOne({
      where: { ownerId, documentId },
      order: { createdAt: 'DESC' },
    });
    if (!job) throw new BadRequestException('未找到文档处理任务');
    const retryable: IngestionJobStatus[] = [
      IngestionJobStatus.Failed,
      IngestionJobStatus.Uploaded,
      IngestionJobStatus.Deleting,
    ];
    if (!retryable.includes(job.status)) {
      throw new BadRequestException('只有失败或待处理任务可以重试');
    }
    const isDelete = job.operation === IngestionJobOperation.Delete;
    // 按原操作重发：删除任务若重发成 index，会因文档已软删而必然失败
    job.status = isDelete
      ? IngestionJobStatus.Deleting
      : IngestionJobStatus.Uploaded;
    job.currentStage = 'retry_pending';
    job.errorCode = null;
    job.errorMessage = null;
    await this.jobRepository.save(job);
    if (!isDelete) {
      await this.em.update(
        DocumentEntity,
        { id: documentId, ownerId, deleted: false },
        { status: DocumentStatus.Processing },
      );
    }
    await this.publisher.publishIndex({
      jobId: job.id,
      ownerId,
      documentId,
      documentVersion: job.documentVersion,
      operation: job.operation,
    });
    return {
      documentId,
      jobId: job.id,
      status: job.status,
      retryCount: job.retryCount,
    };
  }

  /** 按幂等键返回既有文档与其最新 job；未命中返回 null */
  private async findByUploadKey(ownerId: string, uploadKey: string) {
    const document = await this.em.findOne(DocumentEntity, {
      where: { ownerId, uploadKey, deleted: false },
    });
    if (!document) return null;
    const job = await this.jobRepository.findOne({
      where: { ownerId, documentId: document.id },
      order: { createdAt: 'DESC' },
    });
    return {
      documentId: document.id,
      jobId: job?.id ?? '',
      title: document.title,
      fileName: document.sourceFileName ?? undefined,
      fileExtension: document.sourceFileExtension ?? undefined,
      fileSize: document.sourceFileSize
        ? Number(document.sourceFileSize)
        : undefined,
      fileKey: document.sourceFileKey ?? null,
      graphEnabled: document.graphEnabled,
      status: job?.status ?? IngestionJobStatus.Uploaded,
    };
  }
}

/** Postgres 唯一约束冲突（23505） */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === '23505';
}

function progressOf(job: {
  stageCompleted?: number;
  stageTotal?: number;
  stageStartedAt?: Date | null;
}) {
  const completed = job.stageCompleted ?? 0;
  const total = job.stageTotal ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const elapsedMs = job.stageStartedAt
    ? Math.max(Date.now() - job.stageStartedAt.getTime(), 0)
    : 0;
  const estimatedRemainingSeconds =
    completed > 0 && total > completed
      ? Math.ceil(((elapsedMs / completed) * (total - completed)) / 1000)
      : null;
  return {
    completed,
    total,
    percent,
    estimatedRemainingSeconds,
    stageStartedAt: job.stageStartedAt ?? null,
  };
}
