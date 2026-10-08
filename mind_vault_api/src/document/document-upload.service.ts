import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EntityManager, In, Repository } from 'typeorm';
import { readFile } from 'node:fs/promises';
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
import {
  matchesFileSignature,
  SIGNATURE_SAMPLE_BYTES,
} from './parser/utils/file-signature';
import {
  cleanupUploadTempDir,
  ensureUploadTempDir,
  hashFileSha256,
  readFileHead,
  removeFileQuietly,
} from './parser/utils/upload-temp.util';
import { FileParserService } from './parser/file-parser.service';
import { nextSnowflakeId } from '../common/snowflake-id';
import { DocumentGraphTaskService } from './graph/document-graph-task.service';
import { DocumentStatus } from './document-status';
import {
  IngestionEvent,
  logIngestionEvent,
} from '../common/logging/ingestion-event.logger';

const MAX_SOURCE_BYTES_MIRROR = 8 * 1024 * 1024;

@Injectable()
export class DocumentUploadService implements OnModuleInit {
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

  /** 上传临时目录就绪 + 清理上次异常退出残留的临时文件 */
  async onModuleInit(): Promise<void> {
    await ensureUploadTempDir();
    const removed = await cleanupUploadTempDir();
    if (removed > 0) {
      this.logger.warn(`清理了 ${removed} 个残留的上传临时文件`);
    }
  }

  /** 当前可上传的扩展名清单，供三端共用 */
  supportedFormats(): { extensions: string[] } {
    return { extensions: this.parser.availableExtensions() };
  }

  async upload(
    ownerId: string,
    file: {
      originalname: string;
      mimetype?: string;
      size: number;
      /** 流式落盘的临时文件路径（multer diskStorage），请求结束前由本方法负责删除 */
      path: string;
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
    if (!file?.path) {
      throw new BadRequestException('文件不能为空');
    }
    try {
      if (file.size <= 0) {
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
      const head = await readFileHead(file.path, SIGNATURE_SAMPLE_BYTES);
      if (!matchesFileSignature(extension, head)) {
        throw new BadRequestException({
          message: `文件内容与扩展名 .${extension} 不匹配，请确认文件未被改名`,
          error: 'FILE_TYPE_MISMATCH',
        });
      }
      await this.datasets.findOne(ownerId, datasetId);

      const contentHash = await hashFileSha256(file.path);
      const duplicate = await this.findDuplicate(
        ownerId,
        datasetId,
        contentHash,
      );
      if (duplicate) {
        this.logger.warn(
          `上传命中重复文件：ownerId=${ownerId}, datasetId=${datasetId}, documentId=${duplicate.id}`,
        );
        throw new ConflictException({
          message: `该文件已存在：${duplicate.sourceFileName ?? duplicate.title}`,
          error: 'DUPLICATE_DOCUMENT',
          details: {
            duplicateOf: {
              id: duplicate.id,
              name: duplicate.sourceFileName ?? duplicate.title,
              createdAt: duplicate.createdAt,
            },
          },
        });
      }

      const documentId = nextSnowflakeId();
      const fileKey = this.storage.isEnabled()
        ? await this.storage.uploadFile(file.path, {
            fileName: `${documentId}-${originalname}`,
            contentType: file.mimetype,
            prefix: `users/${ownerId}/documents`,
            size: file.size,
          })
        : null;
      const shouldMirrorSourceBytes =
        file.size <= MAX_SOURCE_BYTES_MIRROR &&
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
        sourceBytes: shouldMirrorSourceBytes
          ? await readFile(file.path)
          : undefined,
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
        contentHash,
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
    } finally {
      await removeFileQuietly(file.path);
    }
  }

  /** 同 ownerId + datasetId 下是否已存在同内容指纹且未删除的文档（U3） */
  private async findDuplicate(
    ownerId: string,
    datasetId: string,
    contentHash: string,
  ): Promise<DocumentEntity | null> {
    const relations = await this.em.find(DatasetDocumentEntity, {
      where: { ownerId, datasetId },
    });
    const documentIds = relations.map((relation) => relation.documentId);
    if (!documentIds.length) return null;
    return this.em.findOne(DocumentEntity, {
      where: { ownerId, contentHash, deleted: false, id: In(documentIds) },
      order: { createdAt: 'DESC' },
    });
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

  /**
   * 取消上传（U8 档 1）：仅当 job 仍停留在 `UPLOADED`（worker 尚未接手）时置为 `CANCELLED`。
   * 已进入解析及之后的阶段不做中途取消——worker 没有阶段间检查点，硬砍会留下半成品索引，
   * 因此这里直接拒绝，由前端把按钮置灰并提示「已进入处理，无法取消」。
   */
  async cancel(ownerId: string, documentId: string) {
    const job = await this.jobRepository.findOne({
      where: { ownerId, documentId },
      order: { createdAt: 'DESC' },
    });
    if (!job) throw new BadRequestException('未找到文档处理任务');
    if (job.status !== IngestionJobStatus.Uploaded) {
      throw new BadRequestException('已进入处理，无法取消');
    }
    job.status = IngestionJobStatus.Cancelled;
    job.currentStage = 'cancelled';
    job.finishedAt = new Date();
    job.lastHeartbeatAt = job.finishedAt;
    await this.jobRepository.save(job);
    await this.publisher.publishProgress({
      ownerId,
      documentId,
      stage: 'cancelled',
      status: IngestionJobStatus.Cancelled,
      completed: job.stageCompleted ?? 0,
      total: job.stageTotal ?? 0,
      percent: 0,
    });
    this.logger.log(
      `文档上传已取消：ownerId=${ownerId}, documentId=${documentId}, jobId=${job.id}`,
    );
    logIngestionEvent(this.logger, IngestionEvent.Cancelled, {
      jobId: job.id,
      ownerId,
      documentId,
      status: job.status,
      stage: 'cancelled',
    });
    return { documentId, jobId: job.id, status: job.status };
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
