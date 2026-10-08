import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ModelGatewayService } from '../model/model-gateway.service';
import { LangfuseService } from '../observability/langfuse.service';
import {
  extractionSchema,
  GraphExtractionInput,
  GraphExtractionResult,
  GraphTruncation,
} from './graph-types';

/**
 * 抽取 prompt 版本号（G1）：写入任务记录与日志，使「改了 prompt 后质量变好/变坏」
 * 可归因（配合后续准确率回归）。**每次改动 prompt 必须递增。**
 */
export const GRAPH_EXTRACTION_PROMPT_VERSION = 2;

@Injectable()
export class GraphExtractionService {
  constructor(
    private readonly gateway: ModelGatewayService,
    private readonly langfuse: LangfuseService,
    private readonly config?: ConfigService,
  ) {}

  extract(input: GraphExtractionInput): Promise<GraphExtractionResult> {
    const maxEntities = this.intOption('graph.maxEntities', 15);
    const maxRelations = this.intOption('graph.maxRelations', 30);
    const maxTokens = this.intOption('graph.extractionMaxTokens', 2000);
    return this.langfuse.trace(
      {
        name: 'graph.extract',
        userId: input.ownerId,
        // 图谱抽取是后台任务，没有用户会话，用文档与分块定位这次调用
        tags: ['graph', 'extract'],
        metadata: {
          documentId: input.documentId,
          chunkId: input.chunkId,
          promptVersion: String(GRAPH_EXTRACTION_PROMPT_VERSION),
          // 邻居片段是否命中，用于评估 G1 上下文补齐的覆盖面
          hasNeighbors: String(Boolean(input.previousText || input.nextText)),
        },
        input: {
          textChars: input.text.length,
          titlePath: input.titlePath ?? [],
        },
        output: (result) => ({
          entities: result.extraction.entities.length,
          relations: result.extraction.relations.length,
          truncatedEntities: result.truncated.entities,
          truncatedRelations: result.truncated.relations,
        }),
      },
      async () => {
        const { data } = await this.gateway.invokeJson(
          'fast',
          [
            new SystemMessage(
              `你是知识图谱抽取器。只从提供原文中提取实体和关系。实体最多 ${maxEntities} 个，关系最多 ${maxRelations} 条。实体类型只能是 PERSON、PROJECT、TECHNOLOGY、CONCEPT、ORGANIZATION、EVENT。关系类型只能是 USES、USED_FOR、DEPENDS_ON、CAUSES、RELATED_TO、PART_OF、CREATED_BY、MENTIONED_WITH。关系类型边界：优先选具体类型（USES/USED_FOR/DEPENDS_ON/CAUSES/PART_OF/CREATED_BY）；RELATED_TO 是兜底，仅在确有关联但无法归入其他类型时使用；MENTIONED_WITH 仅用于同一片段中被同时提及、但无明确语义关系的情况。不要把所有关系都写成 RELATED_TO。不得编造。实体名必须自足可辨：禁止「本文」「该项目」「它」「该方案」「如上所述」这类指代或泛化写法，遇到指代时用文档标题或章节路径里的具体名称补全（例如用「Elasticsearch 倒排索引」而非「它」）。输出 JSON：{"entities":[{"name":"","type":""}],"relations":[{"source":"","target":"","type":"","confidence":0.0}]}。`,
            ),
            new HumanMessage(buildPrompt(input)),
          ],
          false,
          (raw) => {
            // 截断量必须在裁剪前统计，否则永远为 0
            const truncated = countTruncation(raw, maxEntities, maxRelations);
            const extraction = extractionSchema.parse(
              limitExtraction(raw, maxEntities, maxRelations),
            );
            return {
              extraction,
              truncated,
            } satisfies GraphExtractionResult;
          },
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

/**
 * 组装带上下文的抽取输入（G1）：文档标题 + 章节路径 + 片段序号 + 邻居片段节选。
 * 缺席的段落直接省略，避免出现「（无）」这类噪声。
 */
function buildPrompt(input: GraphExtractionInput): string {
  const lines: string[] = [];
  const title = input.documentTitle?.trim();
  if (title) lines.push(`文档标题：${title}`);
  if (input.titlePath?.length) {
    lines.push(`章节路径：${input.titlePath.join(' > ')}`);
  }
  if (typeof input.chunkOrder === 'number') {
    lines.push(`片段序号：第 ${input.chunkOrder + 1} 段`);
  }
  if (input.previousText?.trim()) {
    lines.push(`相邻上文（节选）：${input.previousText.trim()}`);
  }
  if (input.nextText?.trim()) {
    lines.push(`相邻下文（节选）：${input.nextText.trim()}`);
  }
  const header = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  return `${header}正文：\n${input.text}`;
}

function countTruncation(
  data: unknown,
  maxEntities: number,
  maxRelations: number,
): GraphTruncation {
  const record =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : {};
  return {
    entities: Math.max(arrayLength(record.entities) - maxEntities, 0),
    relations: Math.max(arrayLength(record.relations) - maxRelations, 0),
  };
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
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
