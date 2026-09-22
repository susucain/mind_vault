import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { Repository } from 'typeorm';
import { Channel, ChannelModel, connect, ConsumeMessage } from 'amqplib';
import {
  DocumentIngestionJobEntity,
  IngestionJobStatus,
} from '../entities/document-ingestion-job.entity';
import { DocumentEntity } from '../entities/document.entity';
import {
  DocumentContent,
  DocumentContentDocument,
} from '../schemas/document-content.schema';
import { FileParserService } from '../parser/file-parser.service';
import { RustfsService } from '../../storage/rustfs.service';
import { DocumentChunkingService } from '../chunking/document-chunking.service';
import { EmbeddingService } from '../../embedding/embedding.service';
import { ElasticsearchIndexService } from '../../retrieval/es/elasticsearch-index.service';
import { GraphExtractionService } from '../../graph/graph-extraction.service';
import { KnowledgeGraphService } from '../../graph/knowledge-graph.service';
import { DatasetDocumentEntity } from '../../dataset/entities/dataset-document.entity';

interface IndexMessage {
  jobId: string;
  ownerId: string;
  documentId: string;
  documentVersion: number;
  operation: 'index' | 'delete' | 'reindex';
}

@Injectable()
export class DocumentIngestionWorker {
  private readonly logger = new Logger(DocumentIngestionWorker.name);
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(
    @InjectRepository(DocumentIngestionJobEntity)
    private readonly jobs: Repository<DocumentIngestionJobEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectModel(DocumentContent.name)
    private readonly contents: Model<DocumentContentDocument>,
    private readonly parser: FileParserService,
    private readonly storage: RustfsService,
    private readonly config: ConfigService,
    private readonly chunking: DocumentChunkingService,
    private readonly embedding: EmbeddingService,
    private readonly index: ElasticsearchIndexService,
    private readonly graphExtraction: GraphExtractionService,
    private readonly graph: KnowledgeGraphService,
    @InjectRepository(DatasetDocumentEntity)
    private readonly datasetDocuments: Repository<DatasetDocumentEntity>,
  ) {}

  async onModuleInit() {
    if (!this.config.get<boolean>('INGESTION_WORKER_ENABLED', false)) return;
    this.connection = await connect(
      this.config.get<string>(
        'RABBITMQ_URL',
        'amqp://guest:guest@localhost:5672',
      ),
    );
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange('mind-vault.ingestion', 'topic', {
      durable: true,
    });
    await this.channel.assertQueue('mind-vault.ingestion.worker', {
      durable: true,
    });
    await this.channel.bindQueue(
      'mind-vault.ingestion.worker',
      'mind-vault.ingestion',
      // 通配绑定，避免新增 operation 时漏绑导致消息被交换器丢弃
      'document.*',
    );
    await this.channel.consume(
      'mind-vault.ingestion.worker',
      (message) => void this.handleMessage(message),
    );
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async handleMessage(message: ConsumeMessage | null) {
    if (!message) return;
    try {
      const payload = JSON.parse(message.content.toString()) as IndexMessage;
      await this.process(payload);
      this.channel?.ack(message);
    } catch (error) {
      this.logger.error(
        `文档索引任务失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.channel?.nack(message, false, false);
    }
  }

  async process(message: IndexMessage) {
    let stage = 'parsing';
    const job = await this.jobs.findOne({
      where: {
        id: message.jobId,
        ownerId: message.ownerId,
        documentId: message.documentId,
      },
    });
    if (!job) throw new Error(`索引任务不存在: ${message.jobId}`);
    if (job.documentVersion !== message.documentVersion) {
      this.logger.warn(`跳过过期索引任务: jobId=${job.id}`);
      return { ...job, skipped: true };
    }
    if (
      job.status === IngestionJobStatus.Parsed ||
      job.status === IngestionJobStatus.Ready
    ) {
      return job;
    }
    if (message.operation === 'delete') {
      return this.deleteDocument(message, job);
    }
    if (message.operation !== 'index' && message.operation !== 'reindex') {
      return job;
    }

    try {
      await this.updateJob(job, IngestionJobStatus.Parsing, 'parsing');
      const document = await this.documents.findOne({
        where: {
          id: message.documentId,
          ownerId: message.ownerId,
          deleted: false,
        },
      });
      if (!document)
        throw new Error(`文档不存在或已删除: ${message.documentId}`);

      const content = await this.contents
        .findOne({ documentId: document.id, deleted: false })
        .lean();
      const mirroredBytes = toBuffer(content?.sourceBytes);
      let buffer = mirroredBytes;
      if (!buffer?.length && document.sourceFileKey) {
        try {
          buffer = await this.storage.downloadBytes(document.sourceFileKey);
        } catch (error) {
          if (!mirroredBytes) throw error;
          this.logger.warn(
            `RustFS 下载失败，使用开发镜像回退: documentId=${document.id}, error=${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (!buffer?.length) throw new Error('找不到原文件内容');

      const parsed = await this.parser.parseStructured({
        originalname: document.sourceFileName ?? document.title,
        buffer,
        size: buffer.length,
      });
      await this.contents.updateOne(
        { _id: document.contentId, deleted: false },
        {
          $set: {
            content: parsed.rawText,
            contentLength: parsed.rawText.length,
            contentSummary: parsed.rawText.slice(0, 200),
            sections: parsed.sections,
            pageCount: parsed.pageCount ?? 0,
          },
          $inc: { version: 1 },
        },
      );
      await this.updateJob(job, IngestionJobStatus.Parsed, 'parsed');
      const chunks = this.chunking.chunk(
        message.ownerId,
        document.id,
        message.documentVersion,
        parsed,
      );
      await this.updateJob(job, IngestionJobStatus.Chunking, 'chunking');
      stage = 'embedding';
      await this.updateJob(job, IngestionJobStatus.Embedding, 'embedding');
      const vectors = await this.embedding.embedDocuments(
        chunks.map((chunk) => chunk.text),
      );
      chunks.forEach((chunk, index) => {
        chunk.embedding = vectors[index];
      });
      const datasetRows = await this.datasetDocuments.find({
        where: { ownerId: message.ownerId, documentId: document.id },
      });
      const datasetIds = datasetRows.map((row) => row.datasetId);
      chunks.forEach((chunk) => {
        chunk.datasetIds = datasetIds;
      });
      stage = 'indexing';
      await this.updateJob(job, IngestionJobStatus.Indexing, 'indexing');
      if (message.operation === 'reindex') {
        // 重建前清空旧数据：分块策略或 embedding 模型变化后 chunkId 会变，
        // 不清空会导致新旧 chunk 同时留在索引里被重复召回
        await this.index.deleteByDocument(message.ownerId, message.documentId);
        await this.graph.deleteDocument(message.ownerId, message.documentId);
      }
      await this.index.indexChunks(chunks);
      for (const chunk of chunks) {
        const extraction = await this.graphExtraction.extract(chunk);
        await this.graph.indexChunk({
          ownerId: message.ownerId,
          documentId: document.id,
          documentVersion: message.documentVersion,
          chunkId: chunk.chunkId,
          datasetIds,
          ...extraction,
        });
      }
      await this.updateJob(job, IngestionJobStatus.Ready, 'ready');
      return {
        jobId: job.id,
        documentId: document.id,
        status: IngestionJobStatus.Ready,
        sectionCount: parsed.sections.length,
        chunkCount: chunks.length,
      };
    } catch (error) {
      job.status = IngestionJobStatus.Failed;
      job.currentStage = stage;
      job.retryCount += 1;
      job.errorCode = 'PARSE_FAILED';
      job.errorMessage = error instanceof Error ? error.message : String(error);
      await this.jobs.save(job);
      throw error;
    }
  }

  private async updateJob(
    job: DocumentIngestionJobEntity,
    status: IngestionJobStatus,
    stage: string,
  ) {
    job.status = status;
    job.currentStage = stage;
    job.errorCode = null;
    job.errorMessage = null;
    return this.jobs.save(job);
  }

  private async deleteDocument(
    message: IndexMessage,
    job: DocumentIngestionJobEntity,
  ) {
    if (job.status === IngestionJobStatus.Deleted) {
      return {
        jobId: job.id,
        documentId: message.documentId,
        status: IngestionJobStatus.Deleted,
        skipped: true,
      };
    }
    const document = await this.documents.findOne({
      where: { id: message.documentId, ownerId: message.ownerId },
    });
    if (document?.sourceFileKey && this.storage.isEnabled()) {
      await this.storage.deleteObject(document.sourceFileKey);
    }
    await this.index.deleteByDocument(message.ownerId, message.documentId);
    await this.graph.deleteDocument(message.ownerId, message.documentId);
    job.status = IngestionJobStatus.Deleted;
    job.currentStage = 'deleted';
    job.errorCode = null;
    job.errorMessage = null;
    await this.jobs.save(job);
    return {
      jobId: job.id,
      documentId: message.documentId,
      status: IngestionJobStatus.Deleted,
    };
  }
}

function toBuffer(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'buffer' in value &&
    Buffer.isBuffer(value.buffer)
  ) {
    return value.buffer;
  }
  return undefined;
}
