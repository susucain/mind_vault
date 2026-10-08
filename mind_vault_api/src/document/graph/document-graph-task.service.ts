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
  /** 已终态任务的耗时聚合（毫秒），用于文档级汇总日志 */
  averageDurationMs?: number | null;
  totalDurationMs?: number | null;
  /** 质量计数聚合（G3）：把「丢了多少 / 截了多少」按文档汇总 */
  quality?: GraphQualityTotals;
}

/** 文档级质量合计（G3） */
export interface GraphQualityTotals {
  entities: number;
  relations: number;
  droppedMissingEndpoint: number;
  droppedSelfLoop: number;
  droppedInvalidType: number;
  truncatedEntities: number;
  truncatedRelations: number;
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
    const minChars = this.minChunkChars();
    const seenContent = new Set<string>();
    const candidates = chunks.filter((chunk) => {
      const text = (chunk.text ?? '').trim();
      // 短块（标题行、目录、表格残片）不入图
      if (text.length < minChars) return false;
      // 同文档内完全相同的文本只抽一次（分块有重叠，正文也可能重复）
      const fingerprint = text.replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
      if (seenContent.has(fingerprint)) return false;
      seenContent.add(fingerprint);
      return true;
    });
    if (candidates.length === 0) return;

    const { ownerId, documentId, documentVersion } = candidates[0];
    const existing = await this.tasks.find({
      where: { ownerId, documentId, documentVersion },
      select: { id: true, chunkId: true, status: true },
    });
    const existingByChunkId = new Map(
      existing.map((task) => [task.chunkId, task]),
    );

    const fresh: DocumentGraphTaskEntity[] = [];
    const requeued: string[] = [];
    for (const chunk of candidates) {
      const task = existingByChunkId.get(chunk.chunkId);
      if (!task) {
        fresh.push(
          this.tasks.create({
            id: nextSnowflakeId(),
            ownerId: chunk.ownerId,
            documentId: chunk.documentId,
            documentVersion: chunk.documentVersion,
            chunkId: chunk.chunkId,
            datasetIds: chunk.datasetIds ?? [],
            status: GraphTaskStatus.Pending,
            retryCount: 0,
          }),
        );
        continue;
      }
      // 已完成或已在途的块不重复入队——重试续跑不重复消耗 token 的关键
      if (
        task.status === GraphTaskStatus.Ready ||
        task.status === GraphTaskStatus.Pending ||
        task.status === GraphTaskStatus.Processing
      ) {
        continue;
      }
      // 失败/取消的块复用原行重投，避免同一 chunk 留下多行污染进度统计
      requeued.push(task.id);
    }

    const savedTasks = fresh.length > 0 ? await this.tasks.save(fresh) : [];
    if (requeued.length > 0) {
      await this.tasks.update(requeued, {
        status: GraphTaskStatus.Pending,
        retryCount: 0,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      });
    }

    const messages = [
      ...savedTasks.map((task) => ({
        taskId: task.id,
        ownerId: task.ownerId,
        documentId: task.documentId,
        documentVersion: task.documentVersion,
      })),
      ...requeued.map((taskId) => ({
        taskId,
        ownerId,
        documentId,
        documentVersion,
      })),
    ];
    await Promise.all(
      messages.map((message) => this.publisher.publishGraph(message)),
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
        quality: true,
      },
    });
    const total = tasks.length;
    const completed = tasks.filter(
      (task) => task.status === GraphTaskStatus.Ready,
    ).length;
    const failed = tasks.filter(
      (task) => task.status === GraphTaskStatus.Failed,
    ).length;
    const cancelled = tasks.filter(
      (task) => task.status === GraphTaskStatus.Cancelled,
    ).length;
    const active = tasks.filter(
      (task) =>
        task.status === GraphTaskStatus.Pending ||
        task.status === GraphTaskStatus.Processing,
    ).length;
    // 取消的块同样是终态：否则进度会永远停在 PROCESSING
    const terminal = completed + failed + cancelled;
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
      .filter((task) => task.startedAt && task.finishedAt)
      .map((task) => task.finishedAt!.getTime() - task.startedAt!.getTime());
    const remaining = Math.max(total - terminal, 0);
    const averageDuration =
      durations.length > 0
        ? durations.reduce((sum, duration) => sum + duration, 0) /
          durations.length
        : null;
    const concurrency = this.concurrency();
    const totalDuration =
      durations.length > 0
        ? durations.reduce((sum, duration) => sum + duration, 0)
        : null;
    // 质量计数按文档汇总（G3）：空 quality（迁移前或未跑）按 0 计
    const quality = tasks.reduce<GraphQualityTotals>(
      (totals, task) => {
        const row = task.quality;
        if (!row) return totals;
        totals.entities += row.entities ?? 0;
        totals.relations += row.relations ?? 0;
        totals.droppedMissingEndpoint += row.dropped?.missingEndpoint ?? 0;
        totals.droppedSelfLoop += row.dropped?.selfLoop ?? 0;
        totals.droppedInvalidType += row.dropped?.invalidType ?? 0;
        totals.truncatedEntities += row.truncatedEntities ?? 0;
        totals.truncatedRelations += row.truncatedRelations ?? 0;
        return totals;
      },
      {
        entities: 0,
        relations: 0,
        droppedMissingEndpoint: 0,
        droppedSelfLoop: 0,
        droppedInvalidType: 0,
        truncatedEntities: 0,
        truncatedRelations: 0,
      },
    );
    return {
      status,
      completed,
      total,
      failed,
      estimatedRemainingSeconds:
        averageDuration === null || remaining === 0
          ? null
          : Math.ceil((averageDuration * remaining) / concurrency / 1000),
      averageDurationMs:
        averageDuration === null ? null : Math.round(averageDuration),
      totalDurationMs:
        totalDuration === null ? null : Math.round(totalDuration),
      quality,
    };
  }

  private concurrency() {
    const configured = Number(
      this.config?.get<string | number>('graph.workerConcurrency', 6) ?? 6,
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 6;
  }

  private minChunkChars() {
    const configured = Number(
      this.config?.get<string | number>('graph.minChunkChars', 80) ?? 80,
    );
    return Number.isFinite(configured) && configured >= 0 ? configured : 80;
  }
}
