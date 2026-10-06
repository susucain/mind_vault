import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateConversationDto {
  /** 空数组表示「全部资料集」，检索层对空范围不做资料集过滤 */
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  datasetIds: string[];
}
