import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentModule } from './document/document.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import configuration from './config/configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from './document/entities/document.entity';
import { DocumentReviewEntity } from './document/entities/document-review.entity';
import { MongooseModule } from '@nestjs/mongoose';
import { buildConfiguration } from './config/configuration';
import { DatasetModule } from './dataset/dataset.module';
import { DatasetEntity } from './dataset/entities/dataset.entity';
import { DatasetDocumentEntity } from './dataset/entities/dataset-document.entity';
import { DocumentIngestionJobEntity } from './document/entities/document-ingestion-job.entity';

const standalone = buildConfiguration(process.env).runtime.standalone;

@Module({
  imports: [
    ...(standalone ? [] : [DatasetModule, DocumentModule]),
    AuthModule,
    HealthModule,
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
                DocumentReviewEntity,
                DatasetEntity,
                DatasetDocumentEntity,
                DocumentIngestionJobEntity,
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
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
