import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j from 'neo4j-driver';
import { AuthModule } from '../auth/auth.module';
import { GraphController } from './graph.controller';
import { GraphExtractionService } from './graph-extraction.service';
import { KnowledgeGraphService, NEO4J_DRIVER } from './knowledge-graph.service';

@Module({
  imports: [AuthModule],
  controllers: [GraphController],
  providers: [
    {
      provide: NEO4J_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        neo4j.driver(
          config.get<string>('NEO4J_URI', 'bolt://localhost:7687'),
          neo4j.auth.basic(
            config.get<string>('NEO4J_USER', 'neo4j'),
            config.get<string>('NEO4J_PASSWORD', '12345678'),
          ),
        ),
    },
    GraphExtractionService,
    KnowledgeGraphService,
  ],
  exports: [GraphExtractionService, KnowledgeGraphService],
})
export class GraphModule {}
