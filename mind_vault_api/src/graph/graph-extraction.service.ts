import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DocumentChunk } from '../document/chunking/document-chunk';
import { ModelGatewayService } from '../model/model-gateway.service';
import { LangfuseService } from '../observability/langfuse.service';
import { extractionSchema, GraphExtraction } from './graph-types';

@Injectable()
export class GraphExtractionService {
  constructor(
    private readonly gateway: ModelGatewayService,
    private readonly langfuse: LangfuseService,
    private readonly config?: ConfigService,
  ) {}

  extract(chunk: DocumentChunk): Promise<GraphExtraction> {
    const maxEntities = this.intOption('graph.maxEntities', 15);
    const maxRelations = this.intOption('graph.maxRelations', 30);
    const maxTokens = this.intOption('graph.extractionMaxTokens', 2000);
    return this.langfuse.trace(
      {
        name: 'graph.extract',
        userId: chunk.ownerId,
        // 图谱抽取是后台任务，没有用户会话，用文档与分块定位这次调用
        tags: ['graph', 'extract'],
        metadata: { documentId: chunk.documentId, chunkId: chunk.chunkId },
        input: { textChars: chunk.text.length },
        output: (result) => ({
          entities: result.entities.length,
          relations: result.relations.length,
        }),
      },
      async () => {
        const { data } = await this.gateway.invokeJson(
          'fast',
          [
            new SystemMessage(
              `你是知识图谱抽取器。只从提供原文中提取实体和关系。实体最多 ${maxEntities} 个，关系最多 ${maxRelations} 条。实体类型只能是 PERSON、PROJECT、TECHNOLOGY、CONCEPT、ORGANIZATION、EVENT。关系类型只能是 USES、USED_FOR、DEPENDS_ON、CAUSES、RELATED_TO、PART_OF、CREATED_BY、MENTIONED_WITH。不得编造。输出 JSON：{"entities":[{"name":"","type":""}],"relations":[{"source":"","target":"","type":"","confidence":0.0}]}。`,
            ),
            new HumanMessage(`来源文档片段：\n${chunk.text}`),
          ],
          false,
          (raw) =>
            extractionSchema.parse(
              limitExtraction(raw, maxEntities, maxRelations),
            ),
          { maxTokens },
        );
        return data;
      },
    );
  }

  private intOption(key: string, fallback: number): number {
    const value = Number(
      this.config?.get<string | number>(key, fallback) ?? fallback,
    );
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}

function limitExtraction(
  data: unknown,
  maxEntities: number,
  maxRelations: number,
): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return data;
  }
  const extraction = data as Record<string, unknown>;
  return {
    ...extraction,
    entities: limitArray(extraction.entities, maxEntities),
    relations: limitArray(extraction.relations, maxRelations),
  };
}

function limitArray(value: unknown, maximum: number): unknown {
  return Array.isArray(value) ? value.slice(0, maximum) : value;
}
