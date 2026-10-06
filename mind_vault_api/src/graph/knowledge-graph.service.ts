import { Inject, Injectable } from '@nestjs/common';
import type { Driver } from 'neo4j-driver';
import {
  GraphEntitySuggestion,
  GraphEntitySuggestionInput,
  GraphExtraction,
  GraphNeighborhoodInput,
  GraphSearchInput,
  GraphView,
  GraphViewEdge,
  GraphViewNode,
  RelationType,
} from './graph-types';

export const NEO4J_DRIVER = Symbol('NEO4J_DRIVER');

interface GraphIndexInput extends GraphExtraction {
  ownerId: string;
  documentId: string;
  documentVersion: number;
  chunkId: string;
  datasetIds?: string[];
}

@Injectable()
export class KnowledgeGraphService {
  constructor(@Inject(NEO4J_DRIVER) private readonly driver: Driver) {}

  async onModuleInit() {
    const session = this.driver.session();
    try {
      await session.run(
        'CREATE CONSTRAINT entity_owner_name IF NOT EXISTS FOR (e:Entity) REQUIRE (e.ownerId, e.normalizedName) IS UNIQUE',
      );
      await session.run(
        'CREATE CONSTRAINT chunk_owner_id IF NOT EXISTS FOR (c:Chunk) REQUIRE (c.ownerId, c.id) IS UNIQUE',
      );
      await session.run(
        'CREATE CONSTRAINT document_owner_id IF NOT EXISTS FOR (d:Document) REQUIRE (d.ownerId, d.id) IS UNIQUE',
      );
    } finally {
      await session.close();
    }
  }

  async indexChunk(input: GraphIndexInput): Promise<void> {
    const entities = input.entities.map((entity) => ({
      ...entity,
      normalizedName: normalizeName(entity.name),
      name: entity.name.trim(),
    }));
    const entitiesByName = new Map(
      entities.map((entity) => [entity.normalizedName, entity]),
    );
    const session = this.driver.session();
    try {
      await session.run(
        `
        MERGE (document:Document {ownerId: $ownerId, id: $documentId})
        SET document.datasetIds = $datasetIds, document.version = $documentVersion
        MERGE (chunk:Chunk {ownerId: $ownerId, id: $chunkId})
        SET chunk.documentId = $documentId, chunk.version = $documentVersion
        MERGE (chunk)-[:PART_OF {ownerId: $ownerId}]->(document)
        `,
        {
          ownerId: input.ownerId,
          documentId: input.documentId,
          documentVersion: input.documentVersion,
          chunkId: input.chunkId,
          datasetIds: input.datasetIds ?? [],
        },
      );
      for (const entity of entities) {
        await session.run(
          `
          MERGE (entity:Entity {ownerId: $ownerId, normalizedName: $normalizedName})
          SET entity.name = $name, entity.type = $type
          WITH entity
          MATCH (chunk:Chunk {ownerId: $ownerId, id: $chunkId})
          MERGE (entity)-[:MENTIONED_IN {ownerId: $ownerId}]->(chunk)
          `,
          {
            ownerId: input.ownerId,
            chunkId: input.chunkId,
            normalizedName: entity.normalizedName,
            name: entity.name,
            type: entity.type,
          },
        );
      }
      for (const relation of input.relations) {
        const source = entitiesByName.get(normalizeName(relation.source));
        const target = entitiesByName.get(normalizeName(relation.target));
        if (
          !source ||
          !target ||
          source.normalizedName === target.normalizedName
        )
          continue;
        await this.mergeRelationship(
          session,
          input.ownerId,
          input.chunkId,
          relation.type,
          relation.confidence,
          source,
          target,
        );
      }
    } finally {
      await session.close();
    }
  }

  async search(input: GraphSearchInput) {
    const maxHops = Math.min(Math.max(input.maxHops ?? 2, 1), 3);
    const names = input.entityNames.map(normalizeName).filter(Boolean);
    if (names.length === 0) return { entities: [], relations: [] };
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (source:Entity {ownerId: $ownerId})
        WHERE source.normalizedName IN $names
        MATCH path=(source)-[relation:RELATED_TO|USES|USED_FOR|DEPENDS_ON|CAUSES|PART_OF|CREATED_BY|MENTIONED_WITH*1..${maxHops}]-(target:Entity {ownerId: $ownerId})
        WHERE $datasetIds = []
          OR EXISTS {
            MATCH (source)-[:MENTIONED_IN {ownerId: $ownerId}]->(:Chunk)-[:PART_OF {ownerId: $ownerId}]->(document:Document {ownerId: $ownerId})
            WHERE ANY(datasetId IN document.datasetIds WHERE datasetId IN $datasetIds)
          }
        RETURN DISTINCT source, target, relationships(path) AS relationships
        LIMIT 50
        `,
        {
          ownerId: input.ownerId,
          names,
          datasetIds: input.datasetIds ?? [],
        },
      );
      const entities = new Map<string, { name: string; type: string }>();
      const relations = new Map<
        string,
        {
          source: string;
          target: string;
          type: string;
          sourceChunkId?: string;
          confidence?: number;
        }
      >();
      for (const record of result.records) {
        const source = nodeProperties(record.get('source'));
        const target = nodeProperties(record.get('target'));
        entities.set(stringProperty(source, 'normalizedName'), {
          name: stringProperty(source, 'name'),
          type: stringProperty(source, 'type'),
        });
        entities.set(stringProperty(target, 'normalizedName'), {
          name: stringProperty(target, 'name'),
          type: stringProperty(target, 'type'),
        });
        for (const relationship of relationshipList(
          record.get('relationships'),
        )) {
          const relationshipProperties = nodeProperties(
            relationship.properties,
          );
          const graphRelation = {
            source: stringProperty(source, 'name'),
            target: stringProperty(target, 'name'),
            type: stringProperty(relationship, 'type'),
            sourceChunkId: optionalStringProperty(
              relationshipProperties,
              'sourceChunkId',
            ),
            confidence: optionalNumberProperty(
              relationshipProperties,
              'confidence',
            ),
          };
          const relationKey = [
            graphRelation.source,
            graphRelation.target,
            graphRelation.type,
            graphRelation.sourceChunkId ?? '',
          ].join(':');
          relations.set(relationKey, graphRelation);
        }
      }
      return {
        entities: [...entities.values()],
        relations: [...relations.values()],
      };
    } finally {
      await session.close();
    }
  }

  /**
   * 实体联想：用于图谱检索的输入提示与空白态热门实体。
   * q 为空时按被提及次数返回热门实体。
   */
  async findEntities(
    input: GraphEntitySuggestionInput,
  ): Promise<GraphEntitySuggestion[]> {
    const limit = Math.trunc(Math.min(Math.max(input.limit ?? 20, 1), 50));
    const q = (input.q ?? '').trim().toLocaleLowerCase('zh-CN');
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (entity:Entity {ownerId: $ownerId})
        WHERE ($q = '' OR toLower(entity.name) CONTAINS $q)
          AND ($types = [] OR entity.type IN $types)
        OPTIONAL MATCH (entity)-[:MENTIONED_IN {ownerId: $ownerId}]->(chunk:Chunk {ownerId: $ownerId})
        RETURN entity.normalizedName AS id, entity.name AS name, entity.type AS type,
               count(DISTINCT chunk) AS mentionCount
        ORDER BY mentionCount DESC, name ASC
        LIMIT ${limit}
        `,
        {
          ownerId: input.ownerId,
          q,
          types: input.types ?? [],
        },
      );
      return result.records.map((record) => ({
        id: asString(record.get('id')),
        name: asString(record.get('name')),
        type: asString(record.get('type')),
        mentionCount: asNumber(record.get('mentionCount')),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * 邻域展开：返回带 id / 展示名 / 度数 / 类型过滤的可视化视图。
   * 关系类型无法作为 Cypher 参数，故模式里内联全量类型，再用 WHERE 收敛。
   */
  async neighborhood(input: GraphNeighborhoodInput): Promise<GraphView> {
    const maxHops = Math.min(Math.max(input.maxHops ?? 1, 1), 3);
    const limit = Math.trunc(Math.min(Math.max(input.limit ?? 60, 10), 200));
    const names = input.entities.map(normalizeName).filter(Boolean);
    const focusLabel = input.entities[0]?.trim() ?? '';
    if (names.length === 0) {
      return { focus: focusLabel, nodes: [], edges: [], truncated: false };
    }
    const session = this.driver.session();
    try {
      const focusResult = await session.run(
        `
        MATCH (entity:Entity {ownerId: $ownerId})
        WHERE entity.normalizedName IN $names
        RETURN entity.normalizedName AS id, entity.name AS name, entity.type AS type
        `,
        { ownerId: input.ownerId, names },
      );
      const nodeMap = new Map<string, GraphViewNode>();
      for (const record of focusResult.records) {
        const id = asString(record.get('id'));
        if (!id) continue;
        nodeMap.set(id, {
          id,
          name: asString(record.get('name')) || id,
          type: asString(record.get('type')),
          degree: 0,
          isFocus: true,
        });
      }

      const result = await session.run(
        `
        MATCH (source:Entity {ownerId: $ownerId})
        WHERE source.normalizedName IN $names
        MATCH path=(source)-[relation:RELATED_TO|USES|USED_FOR|DEPENDS_ON|CAUSES|PART_OF|CREATED_BY|MENTIONED_WITH*1..${maxHops}]-(target:Entity {ownerId: $ownerId})
        WHERE ($relationTypes = [] OR ALL(r IN relationships(path) WHERE type(r) IN $relationTypes))
          AND ($datasetIds = []
            OR EXISTS {
              MATCH (source)-[:MENTIONED_IN {ownerId: $ownerId}]->(:Chunk)-[:PART_OF {ownerId: $ownerId}]->(document:Document {ownerId: $ownerId})
              WHERE ANY(datasetId IN document.datasetIds WHERE datasetId IN $datasetIds)
            })
        RETURN DISTINCT nodes(path) AS pathNodes, relationships(path) AS pathRelationships
        LIMIT ${limit}
        `,
        {
          ownerId: input.ownerId,
          names,
          relationTypes: input.relationTypes ?? [],
          datasetIds: input.datasetIds ?? [],
        },
      );

      const edgeMap = new Map<string, GraphViewEdge>();
      for (const record of result.records) {
        const pathNodes = nodeList(record.get('pathNodes'));
        const pathRelationships = nodeList(record.get('pathRelationships'));
        pathRelationships.forEach((relationship, index) => {
          const from = nodeProperties(pathNodes[index]);
          const to = nodeProperties(pathNodes[index + 1]);
          if (!from || !to) return;
          const sourceId = asString(from.normalizedName);
          const targetId = asString(to.normalizedName);
          if (!sourceId || !targetId) return;
          collectNode(nodeMap, from);
          collectNode(nodeMap, to);
          const properties = nodeProperties(relationship.properties);
          const type = asString(relationship.type);
          const sourceChunkId = optionalStringProperty(
            properties,
            'sourceChunkId',
          );
          const id = [sourceId, type, targetId, sourceChunkId ?? ''].join('|');
          edgeMap.set(id, {
            id,
            source: sourceId,
            target: targetId,
            type,
            confidence: optionalNumberProperty(properties, 'confidence'),
            sourceChunkId,
          });
        });
      }

      const typeFilter = input.entityTypes?.length
        ? new Set(input.entityTypes)
        : null;
      let nodes = [...nodeMap.values()];
      let edges = [...edgeMap.values()];
      if (typeFilter) {
        nodes = nodes.filter(
          (node) => node.isFocus || typeFilter.has(node.type),
        );
        const kept = new Set(nodes.map((node) => node.id));
        edges = edges.filter(
          (edge) => kept.has(edge.source) && kept.has(edge.target),
        );
      }

      const degree = new Map<string, number>();
      for (const edge of edges) {
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
      }
      const focusId = normalizeName(focusLabel);
      return {
        focus: nodeMap.get(focusId)?.name ?? focusLabel,
        nodes: nodes.map((node) => ({
          ...node,
          degree: degree.get(node.id) ?? 0,
        })),
        edges,
        truncated: result.records.length >= limit,
      };
    } finally {
      await session.close();
    }
  }

  async deleteDocument(ownerId: string, documentId: string) {
    const session = this.driver.session();
    try {
      await session.run(
        `
        MATCH (document:Document {ownerId: $ownerId, id: $documentId})
        MATCH (document)<-[:PART_OF {ownerId: $ownerId}]-(chunk:Chunk)
        MATCH (entity:Entity)-[mention:MENTIONED_IN {ownerId: $ownerId}]->(chunk)
        DELETE mention
        WITH DISTINCT entity
        WHERE NOT (entity)-[:MENTIONED_IN {ownerId: $ownerId}]->(:Chunk)
        DETACH DELETE entity
        `,
        { ownerId, documentId },
      );
      await session.run(
        `
        MATCH (document:Document {ownerId: $ownerId, id: $documentId})
        MATCH (document)<-[:PART_OF {ownerId: $ownerId}]-(remaining:Chunk)
        DETACH DELETE remaining, document
        `,
        { ownerId, documentId },
      );
    } finally {
      await session.close();
    }
  }

  private async mergeRelationship(
    session: ReturnType<Driver['session']>,
    ownerId: string,
    sourceChunkId: string,
    relationType: RelationType,
    confidence: number,
    source: { name: string; normalizedName: string },
    target: { name: string; normalizedName: string },
  ) {
    await session.run(
      `
      MATCH (source:Entity {ownerId: $ownerId, normalizedName: $sourceName})
      MATCH (target:Entity {ownerId: $ownerId, normalizedName: $targetName})
      MERGE (source)-[relation:${relationType} {ownerId: $ownerId, sourceChunkId: $sourceChunkId}]->(target)
      SET relation.confidence = $confidence
      `,
      {
        ownerId,
        sourceName: source.normalizedName,
        targetName: target.normalizedName,
        sourceChunkId,
        confidence,
      },
    );
  }
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Neo4j 的 count() 返回 Integer，需经 toNumber 转换 */
function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function collectNode(
  nodes: Map<string, GraphViewNode>,
  properties: Record<string, unknown>,
): void {
  const id = asString(properties.normalizedName);
  if (!id || nodes.has(id)) return;
  nodes.set(id, {
    id,
    name: asString(properties.name) || id,
    type: asString(properties.type),
    degree: 0,
  });
}

function nodeList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null,
  );
}

function nodeProperties(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  if ('properties' in value && typeof value.properties === 'object') {
    return value.properties as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function relationshipList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null,
  );
}

function stringProperty(
  properties: Record<string, unknown>,
  key: string,
): string {
  return typeof properties[key] === 'string' ? properties[key] : '';
}

function optionalStringProperty(
  properties: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = stringProperty(properties, key);
  return value || undefined;
}

function optionalNumberProperty(
  properties: Record<string, unknown>,
  key: string,
): number | undefined {
  return typeof properties[key] === 'number' ? properties[key] : undefined;
}
