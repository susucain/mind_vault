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

export class GraphSearchDto {
  @IsArray()
  @ArrayMaxSize(10)
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : value.split(',').filter(Boolean),
  )
  @IsString({ each: true })
  entityNames: string[];

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
  @Min(1)
  @Max(3)
  maxHops?: number;
}
