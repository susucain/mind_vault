import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class RetrievalQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : value.split(',').filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  datasetIds?: string[];

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
  @Max(30)
  topK?: number;
}
