import { Inject, Injectable } from '@nestjs/common';
import type { Driver } from 'neo4j-driver';
import { GraphExtraction, GraphSearchInput, RelationType } from './graph-types';

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
