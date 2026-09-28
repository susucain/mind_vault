import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, ChannelModel, ConsumeMessage, connect } from 'amqplib';
import { Observable, Subject } from 'rxjs';

export interface DocumentProgressEvent {
  ownerId: string;
  documentId: string;
  stage: string;
  status: string;
  completed: number;
  total: number;
  percent: number;
  estimatedRemainingSeconds?: number | null;
  graph?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
}

@Injectable()
export class DocumentProgressService implements OnModuleInit, OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: Channel;
  private readonly streams = new Map<string, Subject<DocumentProgressEvent>>();
  private readonly ownerStreams = new Map<string, Subject<DocumentProgressEvent>>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    if (process.env.PROCESS_ROLE === 'worker') return;
    this.connection = await connect(
      this.config.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
    );
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange('mind-vault.events', 'topic', { durable: true });
    const queue = await this.channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    await this.channel.bindQueue(queue.queue, 'mind-vault.events', 'document.progress');
    await this.channel.consume(queue.queue, (message) => this.consume(message));
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  stream(ownerId: string, documentId: string): Observable<DocumentProgressEvent> {
    const key = `${ownerId}:${documentId}`;
    let subject = this.streams.get(key);
    if (!subject) {
      subject = new Subject<DocumentProgressEvent>();
      this.streams.set(key, subject);
    }
    return subject.asObservable();
  }

  streamOwner(ownerId: string): Observable<DocumentProgressEvent> {
    let subject = this.ownerStreams.get(ownerId);
    if (!subject) {
      subject = new Subject<DocumentProgressEvent>();
      this.ownerStreams.set(ownerId, subject);
    }
    return subject.asObservable();
  }

  private consume(message: ConsumeMessage | null) {
    if (!message) return;
    try {
      const event = JSON.parse(message.content.toString()) as DocumentProgressEvent;
      this.streams.get(`${event.ownerId}:${event.documentId}`)?.next(event);
      this.ownerStreams.get(event.ownerId)?.next(event);
      this.channel?.ack(message);
    } catch {
      this.channel?.nack(message, false, false);
    }
  }
}
