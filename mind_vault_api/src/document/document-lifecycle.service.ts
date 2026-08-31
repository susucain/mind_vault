import { Injectable, NotFoundException } from '@nestjs/common';
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
  ) {}

  async remove(ownerId: string, documentId: string) {
    const document = await this.documents.findOne({
      where: { id: documentId, ownerId, deleted: false },
    });
    if (!document)
      throw new NotFoundException(`Document ${documentId} not found`);

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
}
