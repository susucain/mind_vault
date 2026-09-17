import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DocumentModule } from './document/document.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import configuration from './config/configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from './document/entities/document.entity';
import { MongooseModule } from '@nestjs/mongoose';
import { buildConfiguration } from './config/configuration';
import { DatasetModule } from './dataset/dataset.module';
import { DatasetEntity } from './dataset/entities/dataset.entity';
import { DatasetDocumentEntity } from './dataset/entities/dataset-document.entity';
import { DocumentIngestionJobEntity } from './document/entities/document-ingestion-job.entity';
import { GraphModule } from './graph/graph.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { ChatModule } from './chat/chat.module';
import { ConversationEntity } from './chat/entities/conversation.entity';
import { ChatMessageEntity } from './chat/entities/chat-message.entity';
import { ChatCitationEntity } from './chat/entities/citation.entity';
import { InterviewModule } from './interview/interview.module';
import { InterviewSessionEntity } from './interview/entities/interview-session.entity';
import { InterviewTurnEntity } from './interview/entities/interview-turn.entity';
import { ReviewItemEntity } from './interview/entities/review-item.entity';
import { ModelModule } from './model/model.module';

const standalone = buildConfiguration(process.env).runtime.standalone;

@Module({
  imports: [
    ...(standalone
      ? []
      : [
          DatasetModule,
          GraphModule,
          DocumentModule,
          RetrievalModule,
          ChatModule,
          InterviewModule,
        ]),
    AuthModule,
    HealthModule,
    ModelModule,
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ...(standalone
      ? []
      : [
          TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              type: 'postgres' as const,
              host: config.get<string>('POSTGRES_HOST', 'localhost'),
              port: config.get<number>('POSTGRES_PORT', 5432),
              username: config.get<string>('POSTGRES_USER', 'user'),
              password: config.get<string>('POSTGRES_PASSWORD', '123456'),
              database: config.get<string>('POSTGRES_DB', 'knowledge_hub'),
              entities: [
                DocumentEntity,
                DatasetEntity,
                DatasetDocumentEntity,
                DocumentIngestionJobEntity,
                ConversationEntity,
                ChatMessageEntity,
                ChatCitationEntity,
                InterviewSessionEntity,
                InterviewTurnEntity,
                ReviewItemEntity,
              ],
              synchronize: false,
            }),
          }),
          MongooseModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              uri: config.get<string>(
                'MONGO_URI',
                'mongodb://mongo_user:mongo_pass123@localhost:27017/knowledge_hub?authSource=admin',
              ),
            }),
          }),
        ]),
  ],
})
export class AppModule {}
