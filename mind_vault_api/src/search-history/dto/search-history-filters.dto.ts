import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { SearchHistoryFilters } from '../search-history.types';

/**
 * 检索历史的筛选条件快照。
 * 目前由服务端在 record() 时构造（客户端不直接提交该结构），
 * 保留校验装饰器以保证结构一旦进入请求体即可被全局 ValidationPipe 约束。
 */
export class SearchHistoryFiltersDto implements SearchHistoryFilters {
  @IsIn(['relevance', 'recent'])
  sort: 'relevance' | 'recent';

  @IsOptional()
  @IsISO8601()
  from: string | null;

  @IsOptional()
  @IsISO8601()
  to: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  pageSize: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  maxHops: number;
}
