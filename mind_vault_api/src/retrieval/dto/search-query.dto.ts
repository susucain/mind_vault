import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const RETRIEVAL_MODES = [
  'keyword',
  'vector',
  'graph',
  'hybrid',
] as const;
export type RetrievalMode = (typeof RETRIEVAL_MODES)[number];

export const RETRIEVAL_SORTS = ['relevance', 'recent'] as const;
export type RetrievalSort = (typeof RETRIEVAL_SORTS)[number];

/**
 * 统一检索请求体。字段与前端 URL 状态一一对应，
 * 全字段显式声明以适配全局 ValidationPipe 的 forbidNonWhitelisted。
 * ownerId 由 AuthGuard 注入，不接受客户端传入。
 */
export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query: string;

  @IsIn(RETRIEVAL_MODES)
  mode: RetrievalMode;

  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : value.split(',').filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  datasetIds?: string[];

  @IsOptional()
  @IsIn(RETRIEVAL_SORTS)
  sort?: RetrievalSort;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : value.split(',').filter(Boolean),
  )
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  entityNames?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  maxHops?: number;
}
