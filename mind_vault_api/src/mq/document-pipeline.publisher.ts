import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, ChannelModel, connect } from 'amqplib';

@Injectable()
export class DocumentPipelinePublisher {
  private readonly logger = new Logger(DocumentPipelinePublisher.name);
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(private readonly config: ConfigService) {}

  async publishIndex(message: {
    jobId: string;
    ownerId: string;
    documentId: string;
    documentVersion: number;
    operation: 'index' | 'delete' | 'reindex';
  }): Promise<void> {
    const channel = await this.getChannel();
    channel.publish(
      'mind-vault.ingestion',
      `document.${message.operation}`,
      Buffer.from(JSON.stringify(message)),
      { persistent: true, contentType: 'application/json' },
    );
    this.logger.debug(
      `Document pipeline message published: operation=${message.operation}, documentId=${message.documentId}`,
    );
  }

  async publishDelete(message: {
    jobId: string;
    ownerId: string;
    documentId: string;
    documentVersion: number;
    operation: 'delete';
  }) {
    return this.publishIndex(message);
  }

  async publishGraph(message: {
    taskId: string;
    ownerId: string;
    documentId: string;
    documentVersion: number;
  }): Promise<void> {
    const channel = await this.getChannel();
    channel.publish(
      'mind-vault.ingestion',
      'graph.extract',
      Buffer.from(JSON.stringify(message)),
      { persistent: true, contentType: 'application/json' },
    );
    this.logger.debug(
      `Graph task message published: taskId=${message.taskId}, documentId=${message.documentId}`,
    );
  }

  async publishProgress(message: Record<string, unknown>): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertExchange('mind-vault.events', 'topic', { durable: true });
    channel.publish(
      'mind-vault.events',
      'document.progress',
      Buffer.from(JSON.stringify(message)),
      { contentType: 'application/json' },
    );
  }

  private async getChannel(): Promise<Channel> {
    if (this.channel) return this.channel;
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
    return this.channel;
  }
}
