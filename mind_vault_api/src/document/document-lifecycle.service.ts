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
import { DocumentChunkCheckpointService } from './chunking/document-chunk-checkpoint.service';
import { DatasetDocumentEntity } from '../dataset/entities/dataset-document.entity';
import { DocumentStatus } from './document-status';

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
    private readonly checkpoints?: DocumentChunkCheckpointService,
    @InjectRepository(DatasetDocumentEntity)
    private readonly datasetDocuments?: Repository<DatasetDocumentEntity>,
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
    await this.documents.update(
      { id: documentId, ownerId, deleted: false },
      { status: DocumentStatus.Processing },
    );
    await this.publisher.publishIndex({
      jobId: job.id,
      ownerId,
      documentId,
      documentVersion: job.documentVersion,
      operation: 'reindex',
    });
    return { documentId, jobId: job.id, status: job.status };
  }

  /**
   * 事后补建图谱（§5.1）：只对已处理完成且能读到分块检查点的文档入队，
   * 不需要重新上传或重新 embedding。
   *
   * 幂等：`enqueue` 会跳过已完成/在途的块，重复调用不会产生重复任务行；
   * 同时对失败/取消的块复用原行重投，因此重复点击也能修复未完成的图谱。
   */
  async buildGraph(ownerId: string, documentId: string) {
    const document = await this.documents.findOne({
      where: { id: documentId, ownerId, deleted: false },
    });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    const job = await this.jobs.findOne({
      where: { ownerId, documentId },
      order: { createdAt: 'DESC' },
    });
    if (!job || job.status !== IngestionJobStatus.Ready) {
      throw new BadRequestException('文档尚未处理完成，暂不能构建图谱');
    }

    if (!document.graphEnabled) {
      document.graphEnabled = true;
      await this.documents.save(document);
    }

    const chunks =
      (await this.checkpoints?.loadComplete(
        ownerId,
        documentId,
        job.documentVersion,
      )) ?? [];
    if (chunks.length === 0) {
      // 早于检查点方案入库的文档没有 kh_document_chunk 行，抽不出正文（图谱任务行已不存全文）。
      // 这里不报错，改为自动重建索引：重建收尾会落检查点，且因 graphEnabled 已打开，
      // indexing 之后会自行入队图谱任务，用户点一次「未构建图谱」即可。
      const queued = await this.reindex(ownerId, documentId);
      return {
        documentId,
        graphEnabled: true,
        totalChunks: 0,
        graph: null,
        reindexQueued: true,
        jobId: queued.jobId,
      };
    }

    const datasetRows =
      (await this.datasetDocuments?.find({
        where: { ownerId, documentId },
      })) ?? [];
    const datasetIds = datasetRows.map((row) => row.datasetId);
    chunks.forEach((chunk) => {
      chunk.datasetIds = datasetIds;
    });
    await this.graphTasks?.enqueue(chunks);

    const graph =
      (await this.graphTasks?.getProgress(
        ownerId,
        documentId,
        job.documentVersion,
      )) ?? null;
    return {
      documentId,
      graphEnabled: true,
      totalChunks: chunks.length,
      graph,
    };
  }
}
