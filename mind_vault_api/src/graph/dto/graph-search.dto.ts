import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

  /** 默认隐藏低置信关系（G4/D12）；GET 查询串需显式转布尔 */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  includeLowConfidence?: boolean;
}
