import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

/** 局部更新：只处理显式给出的字段，未给出的保持原值 */
export class UpdateConversationDto {
  /** 空数组表示「全部资料集」，检索层对空范围不做资料集过滤 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  datasetIds?: string[];

  @IsOptional()
  @IsBoolean()
  favorite?: boolean;
}