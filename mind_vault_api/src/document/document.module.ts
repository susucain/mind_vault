import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentService } from './document.service';
import { DocumentReviewService } from './document-review.service';
import {
  DocumentContent,
  DocumentContentSchema,
} from './schemas/document-content.schema';
import { FileParserService } from './parser/file-parser.service';
import { RustfsService } from '../storage/rustfs.service';
import { DocumentPipelinePublisher } from '../mq/document-pipeline.publisher';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatasetModule } from '../dataset/dataset.module';
import { DocumentEntity } from './entities/document.entity';
import { DocumentIngestionJobEntity } from './entities/document-ingestion-job.entity';
import { DatasetDocumentEntity } from '../dataset/entities/dataset-document.entity';
import { DocumentUploadService } from './document-upload.service';
import { DocumentUploadController } from './document-upload.controller';
import { DocumentCatalogController } from './document-catalog.controller';
import { DocumentCatalogService } from './document-catalog.service';
import { DocumentIngestionWorker } from './ingestion/document-ingestion.worker';
import { DocumentChunkingService } from './chunking/document-chunking.service';
import { EmbeddingService } from '../embedding/embedding.service';
import {
  ELASTICSEARCH_CLIENT,
  ElasticsearchIndexService,
} from '../retrieval/es/elasticsearch-index.service';
import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';

/**
 * 文档模块
 * - DocumentService：文档 CRUD + 状态流转（草稿 / 发布 / 归档 / 待审核）
 * - DocumentReviewService：发布审核（提交 / 通过 / 驳回）
 */
@Module({
  imports: [
    AuthModule,
    DatasetModule,
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentIngestionJobEntity,
      DatasetDocumentEntity,
    ]),
    MongooseModule.forFeature([
      { name: DocumentContent.name, schema: DocumentContentSchema },
    ]),
  ],
  controllers: [DocumentUploadController, DocumentCatalogController],
  providers: [
    DocumentService,
    DocumentReviewService,
    FileParserService,
    RustfsService,
    DocumentPipelinePublisher,
    DocumentUploadService,
    DocumentCatalogService,
    DocumentIngestionWorker,
    DocumentChunkingService,
    EmbeddingService,
    ElasticsearchIndexService,
    {
      provide: ELASTICSEARCH_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Client({
          node: config.get<string>(
            'ELASTICSEARCH_NODE',
            'http://localhost:9200',
          ),
        }),
    },
  ],
  exports: [DocumentService, DocumentReviewService, FileParserService],
})
export class DocumentModule {}
