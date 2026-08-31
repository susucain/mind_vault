import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { DocumentModule } from '../document/document.module';
import { AuthModule } from '../auth/auth.module';
import { RetrievalController } from './retrieval.controller';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [AuthModule, GraphModule, DocumentModule],
  controllers: [RetrievalController],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
