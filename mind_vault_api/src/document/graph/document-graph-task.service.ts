import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { nextSnowflakeId } from '../../common/snowflake-id';
import { DocumentChunk } from '../chunking/document-chunk';
import { DocumentPipelinePublisher } from '../../mq/document-pipeline.publisher';
import {
  DocumentGraphTaskEntity,
  GraphTaskStatus,
} from './entities/document-graph-task.entity';

export interface GraphProgress {
  status: 'NOT_STARTED' | 'PROCESSING' | 'READY' | 'FAILED';
  completed: number;
  total: number;
  failed: number;
  estimatedRemainingSeconds: number | null;
}

@Injectable()
export class DocumentGraphTaskService {
  constructor(
    @InjectRepository(DocumentGraphTaskEntity)
    private readonly tasks: Repository<DocumentGraphTaskEntity>,
    private readonly publisher: DocumentPipelinePublisher,
    private readonly config?: ConfigService,
  ) {}

  async enqueue(chunks: DocumentChunk[]) {
    if (chunks.length === 0) return;
    const tasks = chunks.map((chunk) =>
      this.tasks.create({
        id: nextSnowflakeId(),
        ownerId: chunk.ownerId,
        documentId: chunk.documentId,
        documentVersion: chunk.documentVersion,
        chunkId: chunk.chunkId,
        text: chunk.text,
        datasetIds: chunk.datasetIds ?? [],
        status: GraphTaskStatus.Pending,
        retryCount: 0,
      }),
    );
    const savedTasks = await this.tasks.save(tasks);
    await Promise.all(
      savedTasks.map((task) =>
        this.publisher.publishGraph({
          taskId: task.id,
          ownerId: task.ownerId,
          documentId: task.documentId,
          documentVersion: task.documentVersion,
        }),
      ),
    );
  }

  async cancelActiveTasks(ownerId: string, documentId: string) {
    await this.tasks.update(
      {
        ownerId,
        documentId,
        status: In([GraphTaskStatus.Pending, GraphTaskStatus.Processing]),
      },
      { status: GraphTaskStatus.Cancelled },
    );
  }

  async getProgress(
    ownerId: string,
    documentId: string,
    documentVersion?: number,
  ): Promise<GraphProgress> {
    const tasks = await this.tasks.find({
      where: {
        ownerId,
        documentId,
        ...(documentVersion === undefined ? {} : { documentVersion }),
      },
      select: {
        status: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    const total = tasks.length;
    const completed = tasks.filter(
      (task) => task.status === GraphTaskStatus.Ready,
    ).length;
    const failed = tasks.filter(
      (task) => task.status === GraphTaskStatus.Failed,
    ).length;
    const active = tasks.filter(
      (task) =>
        task.status === GraphTaskStatus.Pending ||
        task.status === GraphTaskStatus.Processing,
    ).length;
    const terminal = completed + failed;
    const status =
      total === 0
        ? 'NOT_STARTED'
        : terminal === total && failed > 0
          ? 'FAILED'
          : terminal === total
            ? 'READY'
            : active > 0
              ? 'PROCESSING'
              : 'PROCESSING';
    const durations = tasks
      .filter(
        (task) => task.startedAt && task.finishedAt,
      )
      .map(
        (task) =>
          task.finishedAt!.getTime() - task.startedAt!.getTime(),
      );
    const remaining = Math.max(total - terminal, 0);
    const averageDuration =
      durations.length > 0
        ? durations.reduce((sum, duration) => sum + duration, 0) /
          durations.length
        : null;
    const concurrency = this.concurrency();
    return {
      status,
      completed,
      total,
      failed,
      estimatedRemainingSeconds:
        averageDuration === null || remaining === 0
          ? null
          : Math.ceil((averageDuration * remaining) / concurrency / 1000),
    };
  }

  private concurrency() {
    const configured = Number(
      this.config?.get<string | number>('GRAPH_WORKER_CONCURRENCY', 3) ?? 3,
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 3;
  }
}
