import { z } from 'zod';

export const entityTypeSchema = z.enum([
  'PERSON',
  'PROJECT',
  'TECHNOLOGY',
  'CONCEPT',
  'ORGANIZATION',
  'EVENT',
]);

export const relationTypeSchema = z.enum([
  'USES',
  'USED_FOR',
  'DEPENDS_ON',
  'CAUSES',
  'RELATED_TO',
  'PART_OF',
  'CREATED_BY',
  'MENTIONED_WITH',
]);

export const extractionSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        type: entityTypeSchema,
      }),
    )
    .max(30),
  relations: z
    .array(
      z.object({
        source: z.string().min(1).max(120),
        target: z.string().min(1).max(120),
        type: relationTypeSchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(50),
});

export type GraphExtraction = z.infer<typeof extractionSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;
export type RelationType = z.infer<typeof relationTypeSchema>;

export interface GraphSearchInput {
  ownerId: string;
  entityNames: string[];
  maxHops?: number;
  datasetIds?: string[];
}
