import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 正文分页查询：游标为上一页最后一条的 order，省略则从首块开始。 */
export class QueryDocumentSectionsDto {
  /** 上一页最后一条的 order；省略表示从第一块开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number;

  /** 每页块数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
