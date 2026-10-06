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
import { DocumentGraphTaskEntity } from './document/graph/entities/document-graph-task.entity';
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
import { ReviewAttemptEntity } from './interview/entities/review-attempt.entity';
import { ModelModule } from './model/model.module';
import { ObservabilityModule } from './observability/observability.module';
import { MemoryModule } from './memory/memory.module';
import { UserMemoryEntity } from './memory/entities/user-memory.entity';
import { UserEntity } from './auth/entities/user.entity';
import { SearchHistoryModule } from './search-history/search-history.module';
import { SearchHistoryEntity } from './search-history/entities/search-history.entity';
import { AddReviewWorkspaceSchema1790380800000 } from './migrations/1790380800000-add-review-workspace-schema';
import { AddInterviewTopicIntensity1790467200000 } from './migrations/1790467200000-add-interview-topic-intensity';
import { RenameBehavioralTopicToJobFit1790553600000 } from './migrations/1790553600000-rename-behavioral-topic-to-job-fit';
import { AddUserAccount1790812800000 } from './migrations/1790812800000-add-user-account';
import { AddSearchHistory1790899200000 } from './migrations/1790899200000-add-search-history';
import { AddUserAvatar1790985600000 } from './migrations/1790985600000-add-user-avatar';

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
          MemoryModule,
          SearchHistoryModule,
        ]),
    AuthModule,
    HealthModule,
    ModelModule,
    ObservabilityModule,
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
                DocumentGraphTaskEntity,
                ConversationEntity,
                ChatMessageEntity,
                ChatCitationEntity,
                InterviewSessionEntity,
                InterviewTurnEntity,
                ReviewItemEntity,
                ReviewAttemptEntity,
                UserMemoryEntity,
                UserEntity,
                SearchHistoryEntity,
              ],
              synchronize: false,
              migrations: [
                AddReviewWorkspaceSchema1790380800000,
                AddInterviewTopicIntensity1790467200000,
                RenameBehavioralTopicToJobFit1790553600000,
                AddUserAccount1790812800000,
                AddSearchHistory1790899200000,
                AddUserAvatar1790985600000,
              ],
              migrationsRun: true,
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
