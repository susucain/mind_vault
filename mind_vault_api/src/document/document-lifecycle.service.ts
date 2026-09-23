import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { DocumentPipelinePublisher } from '../mq/document-pipeline.publisher';
import {
  DocumentIngestionJobEntity,
  IngestionJobOperation,
  IngestionJobStatus,
} from './entities/document-ingestion-job.entity';
import { DocumentEntity } from './entities/document.entity';
import {
  DocumentContent,
  DocumentContentDocument,
} from './schemas/document-content.schema';
import { RustfsService } from '../storage/rustfs.service';
import { ElasticsearchIndexService } from '../retrieval/es/elasticsearch-index.service';
import { DocumentGraphTaskService } from './graph/document-graph-task.service';

@Injectable()
export class DocumentLifecycleService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectModel(DocumentContent.name)
    private readonly contents: Model<DocumentContentDocument>,
    @InjectRepository(DocumentIngestionJobEntity)
    private readonly jobs: Repository<DocumentIngestionJobEntity>,
    private readonly publisher: DocumentPipelinePublisher,
    private readonly storage: RustfsService,
    private readonly index: ElasticsearchIndexService,
    private readonly graphTasks?: DocumentGraphTaskService,
  ) {}

  async remove(ownerId: string, documentId: string) {
    const document = await this.documents.findOne({
      where: { id: documentId, ownerId, deleted: false },
    });
    if (!document)
      throw new NotFoundException(`Document ${documentId} not found`);

    await this.graphTasks?.cancelActiveTasks(ownerId, documentId);
    document.deleted = true;
    await this.documents.save(document);
    await this.contents.updateOne(
      { _id: document.contentId },
      { $set: { deleted: true } },
    );
    await this.index.markDocumentDeleted(ownerId, documentId);

    const job = await this.jobs.save(
      this.jobs.create({
        id: nextSnowflakeId(),
        ownerId,
        documentId,
        documentVersion: 1,
        operation: IngestionJobOperation.Delete,
        status: IngestionJobStatus.Deleting,
        currentStage: 'deleting',
        retryCount: 0,
      }),
    );
    await this.publisher.publishDelete({
      jobId: job.id,
      ownerId,
      documentId,
      documentVersion: job.documentVersion,
      operation: 'delete',
    });
    return { documentId, jobId: job.id, status: job.status };
  }

  async reindex(ownerId: string, documentId: string) {
    const document = await this.documents.findOne({
      where: { id: documentId, ownerId, deleted: false },
    });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    const previous = await this.jobs.findOne({
      where: { ownerId, documentId },
      order: { createdAt: 'DESC' },
    });
    // 仅在任务已完结时允许重建，避免与进行中的导入/删除并发写同一份索引
    const settled: IngestionJobStatus[] = [
      IngestionJobStatus.Ready,
      IngestionJobStatus.Failed,
      IngestionJobStatus.Deleted,
    ];
    if (previous && !settled.includes(previous.status)) {
      throw new BadRequestException('文档正在处理中，暂不能重建索引');
    }

    // 必须新建任务：复用旧的 READY 任务会被 worker 的状态短路直接跳过
    const job = await this.jobs.save(
      this.jobs.create({
        id: nextSnowflakeId(),
        ownerId,
        documentId,
        documentVersion: (previous?.documentVersion ?? 0) + 1,
        operation: IngestionJobOperation.Reindex,
        status: IngestionJobStatus.Uploaded,
        currentStage: 'reindex_pending',
        retryCount: 0,
      }),
    );
    await this.graphTasks?.cancelActiveTasks(ownerId, documentId);
    await this.publisher.publishIndex({
      jobId: job.id,
      ownerId,
      documentId,
      documentVersion: job.documentVersion,
      operation: 'reindex',
    });
    return { documentId, jobId: job.id, status: job.status };
  }
}
