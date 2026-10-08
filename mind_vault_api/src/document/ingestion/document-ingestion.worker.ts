import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { In, IsNull, LessThan, Repository } from 'typeorm';
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
import { DocumentChunkCheckpointService } from '../chunking/document-chunk-checkpoint.service';
import { EmbeddingService } from '../../embedding/embedding.service';
import { ElasticsearchIndexService } from '../../retrieval/es/elasticsearch-index.service';
import { GraphExtractionService } from '../../graph/graph-extraction.service';
import { KnowledgeGraphService } from '../../graph/knowledge-graph.service';
import { DatasetDocumentEntity } from '../../dataset/entities/dataset-document.entity';
import { DocumentGraphTaskService } from '../graph/document-graph-task.service';
import { DocumentStatus } from '../document-status';
import { DocumentPipelinePublisher } from '../../mq/document-pipeline.publisher';

interface IndexMessage {
  jobId: string;
  ownerId: string;
  documentId: string;
  documentVersion: number;
  operation: 'index' | 'delete' | 'reindex';
}

const RECONNECT_DELAY_MS = 5_000;
const STALE_JOB_SCAN_INTERVAL_MS = 60_000;
// Must stay below RabbitMQ's two-hour consumer timeout, while allowing a
// legitimate large-file parse or embedding call to run longer than 10 minutes.
const DEFAULT_STALE_JOB_TIMEOUT_MS = 40 * 60_000;
// U7：从未被消费过的任务最多自动重投次数（用 retryCount 记录），用尽后仍无心跳才判失败
const MAX_PUBLISH_RETRIES = 1;

@Injectable()
export class DocumentIngestionWorker {
  private readonly logger = new Logger(DocumentIngestionWorker.name);
  private connection?: ChannelModel;
  private channel?: Channel;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private staleJobTimer?: ReturnType<typeof setInterval>;
  private shuttingDown = false;

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
    private readonly graphTasks?: DocumentGraphTaskService,
    private readonly publisher?: DocumentPipelinePublisher,
    private readonly checkpoints?: DocumentChunkCheckpointService,
  ) {}

  async onModuleInit() {
    if (!this.config.get<boolean>('ingestion.workerEnabled', false)) return;
    this.shuttingDown = false;
    await this.failStaleJobs();
    this.staleJobTimer = setInterval(
      () => void this.failStaleJobs(),
      STALE_JOB_SCAN_INTERVAL_MS,
    );
    this.staleJobTimer.unref();
    await this.connectAndConsume();
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.staleJobTimer) clearInterval(this.staleJobTimer);
    await this.channel?.close();
    await this.connection?.close();
  }

  private async failStaleJobs() {
    const cutoff = new Date(Date.now() - this.staleJobTimeoutMs());
    const activeStatuses = [
      IngestionJobStatus.Uploaded,
      IngestionJobStatus.Parsing,
      IngestionJobStatus.Parsed,
      IngestionJobStatus.Chunking,
      IngestionJobStatus.Embedding,
      IngestionJobStatus.Indexing,
    ];
    const jobs = await this.jobs.find({
      where: [
        {
          status: In(activeStatuses),
          lastHeartbeatAt: LessThan(cutoff),
        },
        {
          status: In(activeStatuses),
          lastHeartbeatAt: IsNull(),
          updatedAt: LessThan(cutoff),
        },
      ],
    });
    for (const job of jobs) {
      // U7：Uploaded 且从未有过心跳，说明大概率「消息根本没被消费」（投递失败或消息丢失）。
      // 这类任务先有界重投一次，而不是直接判失败；重投次数用 retryCount 记录。
      if (
        this.publisher &&
        job.status === IngestionJobStatus.Uploaded &&
        !job.lastHeartbeatAt &&
        job.retryCount < MAX_PUBLISH_RETRIES
      ) {
        job.retryCount += 1;
        await this.jobs.save(job);
        try {
          await this.publisher.publishIndex({
            jobId: job.id,
            ownerId: job.ownerId,
            documentId: job.documentId,
            documentVersion: job.documentVersion,
            operation: job.operation,
          });
          this.logger.warn(
            `检测到未投递成功的文档任务，已重投: jobId=${job.id} documentId=${job.documentId}`,
          );
        } catch (error) {
          this.logger.error(
            `文档任务重投失败: jobId=${job.id} error=${error instanceof Error ? error.message : String(error)}`,
          );
        }
        continue;
      }
      job.status = IngestionJobStatus.Failed;
      job.errorCode = 'WORKER_TIMEOUT';
      job.errorMessage = '任务超时或 worker 中断，请重试';
      job.finishedAt = new Date();
      job.lastHeartbeatAt = job.finishedAt;
      await this.jobs.save(job);
      await this.documents.update(
        { id: job.documentId, ownerId: job.ownerId, deleted: false },
        { status: DocumentStatus.Failed },
      );
      await this.publisher?.publishProgress({
        ownerId: job.ownerId,
        documentId: job.documentId,
        stage: job.currentStage ?? 'unknown',
        status: IngestionJobStatus.Failed,
        completed: job.stageCompleted ?? 0,
        total: job.stageTotal ?? 0,
      });
      this.logger.error(
        `文档索引超时: jobId=${job.id} documentId=${job.documentId} stage=${job.currentStage ?? 'unknown'}`,
      );
    }
  }

  private staleJobTimeoutMs() {
    const configured = Number(
      this.config.get<string | number>(
        'DOCUMENT_INGESTION_STALE_MS',
        DEFAULT_STALE_JOB_TIMEOUT_MS,
      ),
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_STALE_JOB_TIMEOUT_MS;
  }

  private async connectAndConsume() {
    if (this.shuttingDown) return;
    try {
      const connection = await connect(
        this.config.get<string>(
          'RABBITMQ_URL',
          'amqp://guest:guest@localhost:5672',
        ),
      );
      const channel = await connection.createChannel();
      connection.on('error', (error) => {
        this.logger.error(`RabbitMQ 连接错误: ${error.message}`);
      });
      connection.on('close', () => {
        this.handleDisconnect(connection, channel, '连接已关闭');
      });
      channel.on('error', (error) => {
        this.logger.error(`RabbitMQ channel 错误: ${error.message}`);
      });
      channel.on('close', () => {
        this.handleDisconnect(connection, channel, 'channel 已关闭');
      });

      await channel.assertExchange('mind-vault.ingestion', 'topic', {
        durable: true,
      });
      await channel.assertQueue('mind-vault.ingestion.worker', {
        durable: true,
      });
      await channel.bindQueue(
        'mind-vault.ingestion.worker',
        'mind-vault.ingestion',
        // 通配绑定，避免新增 operation 时漏绑导致消息被交换器丢弃
        'document.*',
      );
      await channel.prefetch(1);
      await channel.consume(
        'mind-vault.ingestion.worker',
        (message) => void this.handleMessage(channel, message),
      );
      this.connection = connection;
      this.channel = channel;
      this.logger.log('RabbitMQ 文档消费已连接');
    } catch (error) {
      this.logger.error(
        `RabbitMQ 消费连接失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(
    connection: ChannelModel,
    channel: Channel,
    reason: string,
  ) {
    if (this.shuttingDown) return;
    if (this.channel && this.channel !== channel) return;
    if (this.connection === connection) {
      this.connection = undefined;
      this.channel = undefined;
    }
    this.logger.warn(`RabbitMQ ${reason}，将在 5 秒后重连`);
    void connection.close().catch(() => undefined);
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.shuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectAndConsume();
    }, RECONNECT_DELAY_MS);
  }

  private async handleMessage(
    channel: Channel,
    message: ConsumeMessage | null,
  ) {
    if (!message) return;
    try {
      const payload = JSON.parse(message.content.toString()) as IndexMessage;
      await this.process(payload);
      if (this.channel === channel) channel.ack(message);
    } catch (error) {
      this.logger.error(
        `文档索引任务失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (this.channel === channel) channel.nack(message, false, false);
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
      job.status === IngestionJobStatus.Ready ||
      // 用户在 worker 接手前已取消（U8 档 1）：消息可能已经投出，这里直接跳过
      job.status === IngestionJobStatus.Cancelled
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
      const document = await this.documents.findOne({
        where: {
          id: message.documentId,
          ownerId: message.ownerId,
          deleted: false,
        },
      });
      if (!document)
        throw new Error(`文档不存在或已删除: ${message.documentId}`);

      // 版本级短路：同版本检查点齐全（行数 > 0 且 embedding 全部非空）时，
      // 跳过 parsing / chunking / embedding 直接进入 indexing——重试不重复解析与重复付费的关键。
      let chunks =
        (await this.checkpoints?.loadComplete(
          message.ownerId,
          document.id,
          message.documentVersion,
        )) ?? [];
      let sectionCount = new Set(chunks.map((chunk) => chunk.sectionId)).size;

      if (chunks.length === 0) {
        await this.updateJob(job, IngestionJobStatus.Parsing, 'parsing', 0, 1);
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
        await this.updateJob(job, IngestionJobStatus.Parsed, 'parsed', 1, 1);
        chunks = this.chunking.chunk(
          message.ownerId,
          document.id,
          message.documentVersion,
          parsed,
        );
        await this.updateJob(
          job,
          IngestionJobStatus.Chunking,
          'chunking',
          1,
          1,
        );
        stage = 'embedding';
        await this.updateJob(
          job,
          IngestionJobStatus.Embedding,
          'embedding',
          0,
          chunks.length,
        );
        const vectors = await this.embedding.embedDocuments(
          chunks.map((chunk) => chunk.text),
        );
        chunks.forEach((chunk, index) => {
          chunk.embedding = vectors[index];
        });
        await this.updateJob(
          job,
          IngestionJobStatus.Embedding,
          'embedding',
          chunks.length,
          chunks.length,
        );
        // 检查点在 embedding 成功后落库：indexing 阶段失败时重试可整段复用
        await this.checkpoints?.save(chunks);
        sectionCount = parsed.sections.length;
      }

      const datasetRows = await this.datasetDocuments.find({
        where: { ownerId: message.ownerId, documentId: document.id },
      });
      const datasetIds = datasetRows.map((row) => row.datasetId);
      chunks.forEach((chunk) => {
        chunk.datasetIds = datasetIds;
      });
      stage = 'indexing';
      await this.updateJob(
        job,
        IngestionJobStatus.Indexing,
        'indexing',
        0,
        chunks.length,
      );
      if (message.operation === 'reindex') {
        // 重建前清空旧数据：分块策略或 embedding 模型变化后 chunkId 会变，
        // 不清空会导致新旧 chunk 同时留在索引里被重复召回
        await this.graphTasks?.cancelActiveTasks(
          message.ownerId,
          message.documentId,
        );
        await this.index.deleteByDocument(message.ownerId, message.documentId);
        await this.graph.deleteDocument(message.ownerId, message.documentId);
        // 旧版本检查点重建后不再需要，清掉避免随版本号无限累积
        await this.checkpoints?.deleteOtherVersions(
          message.ownerId,
          message.documentId,
          message.documentVersion,
        );
      }
      await this.index.indexChunks(chunks);
      await this.updateJob(
        job,
        IngestionJobStatus.Indexing,
        'indexing',
        chunks.length,
        chunks.length,
      );
      if (document.graphEnabled) {
        await this.graphTasks?.enqueue(chunks);
      } else {
        // 未开启图谱：显式记一帧「已跳过」，让前端能区分「未启用」与「启用了但还没开始」
        await this.updateJob(
          job,
          IngestionJobStatus.Ready,
          'graph_skipped',
          1,
          1,
        );
      }
      await this.updateJob(job, IngestionJobStatus.Ready, 'ready', 1, 1, true);
      await this.documents.update(
        { id: document.id, ownerId: message.ownerId, deleted: false },
        { status: DocumentStatus.Available },
      );
      this.logger.log(
        `文档索引完成: jobId=${job.id} documentId=${document.id} chunks=${chunks.length}`,
      );
      return {
        jobId: job.id,
        documentId: document.id,
        status: IngestionJobStatus.Ready,
        sectionCount,
        chunkCount: chunks.length,
      };
    } catch (error) {
      job.status = IngestionJobStatus.Failed;
      job.currentStage = stage;
      job.retryCount += 1;
      job.errorCode = failureCodeForStage(stage);
      job.errorMessage = error instanceof Error ? error.message : String(error);
      job.finishedAt = new Date();
      job.lastHeartbeatAt = job.finishedAt;
      await this.jobs.save(job);
      await this.documents.update(
        { id: message.documentId, ownerId: message.ownerId, deleted: false },
        { status: DocumentStatus.Failed },
      );
      await this.publisher?.publishProgress({
        ownerId: job.ownerId,
        documentId: job.documentId,
        stage,
        status: IngestionJobStatus.Failed,
        completed: job.stageCompleted,
        total: job.stageTotal,
        percent:
          job.stageTotal > 0
            ? Math.round((job.stageCompleted / job.stageTotal) * 100)
            : 0,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
      });
      this.logger.error(
        `文档索引失败: jobId=${job.id} documentId=${message.documentId} stage=${stage} retry=${job.retryCount} error=${job.errorMessage}`,
      );
      throw error;
    }
  }

  private async updateJob(
    job: DocumentIngestionJobEntity,
    status: IngestionJobStatus,
    stage: string,
    completed = 0,
    total = 0,
    finished = false,
  ) {
    const now = new Date();
    const stageChanged = job.currentStage !== stage;
    job.startedAt ??= now;
    if (stageChanged) job.stageStartedAt = now;
    job.status = status;
    job.currentStage = stage;
    job.stageCompleted = completed;
    job.stageTotal = total;
    job.lastHeartbeatAt = now;
    if (finished) job.finishedAt = now;
    job.errorCode = null;
    job.errorMessage = null;
    const saved = await this.jobs.save(job);
    await this.publisher?.publishProgress({
      ownerId: job.ownerId,
      documentId: job.documentId,
      stage,
      status,
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    });
    this.logger.log(
      `文档索引阶段: jobId=${job.id} documentId=${job.documentId} stage=${stage} status=${status} progress=${completed}/${total}`,
    );
    return saved;
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
    await this.checkpoints?.deleteByDocument(
      message.ownerId,
      message.documentId,
    );
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

function failureCodeForStage(stage: string) {
  switch (stage) {
    case 'embedding':
      return 'EMBEDDING_FAILED';
    case 'indexing':
      return 'INDEXING_FAILED';
    case 'parsing':
      return 'PARSING_FAILED';
    default:
      return 'INGESTION_FAILED';
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
