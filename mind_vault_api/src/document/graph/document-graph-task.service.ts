import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { nextSnowflakeId } from '../../common/snowflake-id';
import { DocumentChunk } from '../chunking/document-chunk';
import { DocumentPipelinePublisher } from '../../mq/document-pipeline.publisher';
import {
  DocumentGraphTaskEntity,
  GraphTaskStatus,
} from './entities/document-graph-task.entity';

@Injectable()
export class DocumentGraphTaskService {
  constructor(
    @InjectRepository(DocumentGraphTaskEntity)
    private readonly tasks: Repository<DocumentGraphTaskEntity>,
    private readonly publisher: DocumentPipelinePublisher,
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
}
