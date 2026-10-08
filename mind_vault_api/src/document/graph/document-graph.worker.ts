import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Channel, ChannelModel, connect, ConsumeMessage } from 'amqplib';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../entities/document.entity';
import { GraphExtractionService } from '../../graph/graph-extraction.service';
import { KnowledgeGraphService } from '../../graph/knowledge-graph.service';
import {
  DocumentGraphTaskEntity,
  GraphTaskStatus,
} from './entities/document-graph-task.entity';
import { DocumentPipelinePublisher } from '../../mq/document-pipeline.publisher';
import { DocumentGraphTaskService } from './document-graph-task.service';
import { DocumentChunkCheckpointService } from '../chunking/document-chunk-checkpoint.service';

const RECONNECT_DELAY_MS = 5_000;

interface GraphTaskMessage {
  taskId: string;
}

@Injectable()
export class DocumentGraphWorker {
  private readonly logger = new Logger(DocumentGraphWorker.name);
  private connection?: ChannelModel;
  private channel?: Channel;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private shuttingDown = false;

  constructor(
    @InjectRepository(DocumentGraphTaskEntity)
    private readonly tasks: Repository<DocumentGraphTaskEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    private readonly extraction: GraphExtractionService,
    private readonly graph: KnowledgeGraphService,
    private readonly config: ConfigService,
    private readonly publisher?: DocumentPipelinePublisher,
    private readonly graphTasks?: DocumentGraphTaskService,
    private readonly checkpoints?: DocumentChunkCheckpointService,
  ) {}

  async onModuleInit() {
    if (!this.config.get<boolean>('graph.workerEnabled', false)) return;
    this.shuttingDown = false;
    await this.connectAndConsume();
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.channel?.close();
    await this.connection?.close();
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
        this.logger.error(`RabbitMQ 图谱连接错误: ${error.message}`);
      });
      connection.on('close', () => {
        this.handleDisconnect(connection, channel, '连接已关闭');
      });
      channel.on('error', (error) => {
        this.logger.error(`RabbitMQ 图谱 channel 错误: ${error.message}`);
      });
      channel.on('close', () => {
        this.handleDisconnect(connection, channel, 'channel 已关闭');
      });
      await channel.assertExchange('mind-vault.ingestion', 'topic', {
        durable: true,
      });
      await channel.assertQueue('mind-vault.graph.worker', {
        durable: true,
      });
      await channel.bindQueue(
        'mind-vault.graph.worker',
        'mind-vault.ingestion',
        'graph.extract',
      );
      await channel.prefetch(this.concurrency());
      await channel.consume(
        'mind-vault.graph.worker',
        (message) => void this.handleMessage(channel, message),
      );
      this.connection = connection;
      this.channel = channel;
      this.logger.log(
        `RabbitMQ 图谱消费已连接: concurrency=${this.concurrency()}`,
      );
    } catch (error) {
      this.logger.error(
        `RabbitMQ 图谱消费连接失败: ${error instanceof Error ? error.message : String(error)}`,
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
    this.logger.warn(`RabbitMQ 图谱${reason}，将在 5 秒后重连`);
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

  async process(message: GraphTaskMessage) {
    const task = await this.tasks.findOne({ where: { id: message.taskId } });
    if (
      !task ||
      task.status === GraphTaskStatus.Ready ||
      task.status === GraphTaskStatus.Cancelled
    ) {
      return;
    }

    if (!(await this.findActiveDocument(task))) {
      task.status = GraphTaskStatus.Cancelled;
      await this.tasks.save(task);
      await this.publishProgress(task);
      return;
    }

    task.status = GraphTaskStatus.Processing;
    task.errorMessage = null;
    task.startedAt = new Date();
    await this.tasks.save(task);
    const startedAt = task.startedAt;
    this.logger.log(
      `图谱任务开始: taskId=${task.id} documentId=${task.documentId} chunkId=${task.chunkId} retry=${task.retryCount}`,
    );
    try {
      // 任务行不再存全文：按 chunkId 从检查点表取正文
      const text = await this.checkpoints?.findTextByChunkId(
        task.ownerId,
        task.documentId,
        task.chunkId,
      );
      if (!text) {
        // 没有检查点就无法抽取，且重试也不会变好——取消而不是失败，避免无限重投
        task.status = GraphTaskStatus.Cancelled;
        task.errorMessage = '缺少分块检查点，无法抽取';
        task.finishedAt = new Date();
        await this.tasks.save(task);
        await this.publishProgress(task);
        this.logger.warn(
          `图谱任务缺少分块检查点: taskId=${task.id} documentId=${task.documentId} chunkId=${task.chunkId}`,
        );
        return;
      }
      const extractStartedAt = Date.now();
      const extraction = await this.extraction.extract({
        chunkId: task.chunkId,
        ownerId: task.ownerId,
        documentId: task.documentId,
        documentVersion: task.documentVersion,
        text,
        datasetIds: task.datasetIds,
      } as never);
      const extractMs = Date.now() - extractStartedAt;
      if (!(await this.findActiveDocument(task))) {
        task.status = GraphTaskStatus.Cancelled;
        await this.tasks.save(task);
        return;
      }
      const activeTask = await this.tasks.findOne({
        where: { id: task.id, status: GraphTaskStatus.Processing },
      });
      if (!activeTask) return;
      const graphStartedAt = Date.now();
      await this.graph.indexChunk({
        ownerId: task.ownerId,
        documentId: task.documentId,
        documentVersion: task.documentVersion,
        chunkId: task.chunkId,
        datasetIds: task.datasetIds,
        ...extraction,
      });
      const graphMs = Date.now() - graphStartedAt;
      task.status = GraphTaskStatus.Ready;
      task.errorMessage = null;
      task.finishedAt = new Date();
      await this.tasks.save(task);
      await this.publishProgress(task);
      this.logger.log(
        `图谱任务完成: taskId=${task.id} documentId=${task.documentId} chunkId=${task.chunkId} extractMs=${extractMs} graphMs=${graphMs} elapsedMs=${task.finishedAt.getTime() - startedAt.getTime()}`,
      );
    } catch (error) {
      task.status = GraphTaskStatus.Failed;
      task.retryCount += 1;
      task.errorMessage =
        error instanceof Error ? error.message : String(error);
      task.finishedAt = new Date();
      await this.tasks.save(task);
      await this.publishProgress(task);
      this.logger.error(
        `图谱任务失败: taskId=${task.id} documentId=${task.documentId} chunkId=${task.chunkId} elapsedMs=${task.finishedAt.getTime() - startedAt.getTime()} error=${task.errorMessage}`,
      );
      throw error;
    }
  }

  private async handleMessage(
    channel: Channel,
    message: ConsumeMessage | null,
  ) {
    if (!message) return;
    try {
      await this.process(
        JSON.parse(message.content.toString()) as GraphTaskMessage,
      );
      if (this.channel === channel) channel.ack(message);
    } catch (error) {
      this.logger.error(
        `图谱任务失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (this.channel === channel) channel.nack(message, false, false);
    }
  }

  private async findActiveDocument(task: DocumentGraphTaskEntity) {
    return this.documents.findOne({
      where: {
        id: task.documentId,
        ownerId: task.ownerId,
        deleted: false,
      },
    });
  }

  private concurrency() {
    const configured = Number(
      this.config.get<string | number>('graph.workerConcurrency', 6) ?? 6,
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 6;
  }

  private async publishProgress(task: DocumentGraphTaskEntity) {
    const graph = await this.graphTasks?.getProgress(
      task.ownerId,
      task.documentId,
      task.documentVersion,
    );
    await this.publisher?.publishProgress({
      ownerId: task.ownerId,
      documentId: task.documentId,
      stage: 'graph',
      status: task.status,
      completed: graph?.completed ?? 0,
      total: graph?.total ?? 0,
      percent:
        graph && graph.total > 0
          ? Math.round((graph.completed / graph.total) * 100)
          : 0,
      graph,
    });
    // 文档级汇总：全部块进入终态时输出一行，作为图谱耗时基线（改造前后对比用）
    if (
      graph &&
      graph.total > 0 &&
      graph.completed + graph.failed >= graph.total
    ) {
      this.logger.log(
        `图谱文档汇总: documentId=${task.documentId} version=${task.documentVersion} chunks=${graph.total} completed=${graph.completed} failed=${graph.failed} llmCalls=${graph.total} avgMs=${graph.averageDurationMs ?? '-'} totalMs=${graph.totalDurationMs ?? '-'}`,
      );
    }
  }
}
