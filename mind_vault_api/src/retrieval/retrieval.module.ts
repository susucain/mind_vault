import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphModule } from '../graph/graph.module';
import { DocumentModule } from '../document/document.module';
import { AuthModule } from '../auth/auth.module';
import { DatasetDocumentEntity } from '../dataset/entities/dataset-document.entity';
import { DatasetEntity } from '../dataset/entities/dataset.entity';
import { DocumentEntity } from '../document/entities/document.entity';
import { SearchHistoryModule } from '../search-history/search-history.module';
import { DocumentMetaService } from './document-meta.service';
import { RetrievalController } from './retrieval.controller';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [
    AuthModule,
    GraphModule,
    DocumentModule,
    SearchHistoryModule,
    TypeOrmModule.forFeature([
      DocumentEntity,
      DatasetEntity,
      DatasetDocumentEntity,
    ]),
  ],
  controllers: [RetrievalController],
  providers: [RetrievalService, DocumentMetaService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
