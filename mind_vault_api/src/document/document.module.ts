import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import { DocumentGraphTaskEntity } from './graph/entities/document-graph-task.entity';
import { DatasetDocumentEntity } from '../dataset/entities/dataset-document.entity';
import { DocumentUploadService } from './document-upload.service';
import { DocumentUploadController } from './document-upload.controller';
import { DocumentCatalogController } from './document-catalog.controller';
import { DocumentCatalogService } from './document-catalog.service';
import { DocumentLifecycleController } from './document-lifecycle.controller';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentIngestionWorker } from './ingestion/document-ingestion.worker';
import { DocumentChunkingService } from './chunking/document-chunking.service';
import { EmbeddingService } from '../embedding/embedding.service';
import {
  ELASTICSEARCH_CLIENT,
  ElasticsearchIndexService,
} from '../retrieval/es/elasticsearch-index.service';
import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';
import { GraphModule } from '../graph/graph.module';
import { DocumentGraphTaskService } from './graph/document-graph-task.service';
import { DocumentGraphWorker } from './graph/document-graph.worker';

@Module({
  imports: [
    AuthModule,
    DatasetModule,
    GraphModule,
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentIngestionJobEntity,
      DocumentGraphTaskEntity,
      DatasetDocumentEntity,
    ]),
    MongooseModule.forFeature([
      { name: DocumentContent.name, schema: DocumentContentSchema },
    ]),
  ],
  controllers: [
    DocumentUploadController,
    DocumentCatalogController,
    DocumentLifecycleController,
  ],
  providers: [
    FileParserService,
    RustfsService,
    DocumentPipelinePublisher,
    DocumentUploadService,
    DocumentCatalogService,
    DocumentLifecycleService,
    DocumentIngestionWorker,
    DocumentGraphTaskService,
    DocumentGraphWorker,
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
  exports: [FileParserService, ElasticsearchIndexService, EmbeddingService],
})
export class DocumentModule {}
