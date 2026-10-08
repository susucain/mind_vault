import { Type } from 'class-transformer';
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

/** 回答相关图谱：按本条回答引用的 chunk 集合查实体关系 */
export class AnswerContextDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  chunkIds: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;

  /** 默认隐藏低置信关系（G4/D12），开启后一并返回 */
  @IsOptional()
  @IsBoolean()
  includeLowConfidence?: boolean;
}
