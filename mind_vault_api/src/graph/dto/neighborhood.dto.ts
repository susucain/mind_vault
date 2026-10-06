import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { entityTypeSchema, relationTypeSchema } from '../graph-types';

const ENTITY_TYPES = entityTypeSchema.options;
const RELATION_TYPES = relationTypeSchema.options;

export class NeighborhoodDto {
  @IsString()
  @MaxLength(120)
  entity: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  maxHops?: number;

  @IsOptional()
  @IsArray()
  @IsIn(ENTITY_TYPES, { each: true })
  entityTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(RELATION_TYPES, { each: true })
  relationTypes?: string[];

  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : value.split(',').filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  datasetIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(200)
  limit?: number;
}
