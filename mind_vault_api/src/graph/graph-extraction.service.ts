import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DocumentChunk } from '../document/chunking/document-chunk';
import { ModelGatewayService } from '../model/model-gateway.service';
import { extractionSchema, GraphExtraction } from './graph-types';

@Injectable()
export class GraphExtractionService {
  constructor(private readonly gateway: ModelGatewayService) {}

  async extract(chunk: DocumentChunk): Promise<GraphExtraction> {
    const { data } = await this.gateway.invokeJson<GraphExtraction>(
      'fast',
      [
        new SystemMessage(
          '你是知识图谱抽取器。只从提供原文中提取实体和关系。实体类型只能是 PERSON、PROJECT、TECHNOLOGY、CONCEPT、ORGANIZATION、EVENT。关系类型只能是 USES、USED_FOR、DEPENDS_ON、CAUSES、RELATED_TO、PART_OF、CREATED_BY、MENTIONED_WITH。不得编造。输出 JSON：{"entities":[{"name":"","type":""}],"relations":[{"source":"","target":"","type":"","confidence":0.0}]}。',
        ),
        new HumanMessage(`来源文档片段：\n${chunk.text}`),
      ],
      false,
    );
    return extractionSchema.parse(data);
  }
}
