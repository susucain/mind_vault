import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DocumentChunk } from '../document/chunking/document-chunk';
import { ModelGatewayService } from '../model/model-gateway.service';
import { extractionSchema, GraphExtraction } from './graph-types';

@Injectable()
export class GraphExtractionService {
  constructor(private readonly gateway: ModelGatewayService) {}

  async extract(chunk: DocumentChunk): Promise<GraphExtraction> {
    const { data } = await this.gateway.invokeJson(
      'fast',
      [
        new SystemMessage(
          '你是知识图谱抽取器。只从提供原文中提取实体和关系。实体最多 30 个，关系最多 50 条。实体类型只能是 PERSON、PROJECT、TECHNOLOGY、CONCEPT、ORGANIZATION、EVENT。关系类型只能是 USES、USED_FOR、DEPENDS_ON、CAUSES、RELATED_TO、PART_OF、CREATED_BY、MENTIONED_WITH。不得编造。输出 JSON：{"entities":[{"name":"","type":""}],"relations":[{"source":"","target":"","type":"","confidence":0.0}]}。',
        ),
        new HumanMessage(`来源文档片段：\n${chunk.text}`),
      ],
      false,
      (raw) => extractionSchema.parse(limitExtraction(raw)),
    );
    return data;
  }
}

function limitExtraction(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return data;
  }
  const extraction = data as Record<string, unknown>;
  return {
    ...extraction,
    entities: limitArray(extraction.entities, 30),
    relations: limitArray(extraction.relations, 50),
  };
}

function limitArray(value: unknown, maximum: number): unknown {
  return Array.isArray(value) ? value.slice(0, maximum) : value;
}
