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
import { nextSnowflakeId } from '../common/snowflake-id';

const SUPPORTED_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'txt',
  'md',
  'csv',
  'json',
]);

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
  ) {}

  async upload(
    ownerId: string,
    file: {
      originalname: string;
      mimetype?: string;
      size: number;
      buffer: Buffer;
    },
    datasetId: string,
    metadata: { tags?: string; remark?: string; sourceFileName?: string } = {},
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('文件不能为空');
    }
    const originalname =
      metadata.sourceFileName?.trim() ||
      decodeUploadFilename(file.originalname);
    const extension = getExtension(originalname);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        `不支持的文件格式: ${extension || '(无扩展名)'}`,
      );
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

    const content = await this.contentModel.create({
      documentId,
      content: '',
      contentLength: 0,
      contentSummary: '',
      version: 1,
      deleted: false,
      sourceBytes:
        !fileKey || process.env.STORAGE_MIRROR_SOURCE_BYTES === 'true'
          ? file.buffer
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
      status: 0,
      wordCount: 0,
      isPublic: false,
      deleted: false,
    });
    const savedDocument = await this.em.save(document);

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
    await this.publisher.publishIndex({
      jobId: savedJob.id,
      ownerId,
      documentId,
      documentVersion: 1,
      operation: 'index',
    });

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
      status: IngestionJobStatus.Uploaded,
    };
  }

  async status(ownerId: string, documentId: string) {
    const job = await this.jobRepository.findOne({
      where: { ownerId, documentId },
      order: { createdAt: 'DESC' },
    });
    if (!job) throw new BadRequestException('未找到文档处理任务');
    return {
      documentId,
      jobId: job.id,
      status: job.status,
      currentStage: job.currentStage,
      retryCount: job.retryCount,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
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
}
