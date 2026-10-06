import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { MemoryKind, MemoryStatus } from '../memory.types';

/** 列表默认每页条数；上限用于挡住一次性拉全表的请求 */
export const MEMORY_PAGE_SIZE_DEFAULT = 20;
export const MEMORY_PAGE_SIZE_MAX = 100;
export const MEMORY_QUERY_MAX_LENGTH = 64;

/** `?q=` 与纯空白都视为未传：否则会退化成 `content LIKE '%%'` 的无意义过滤 */
const normalizeQuery = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class ListMemoriesDto {
  /** 缺省只返回生效中的记忆；SUPERSEDED 用于查看被自动取代的历史 */
  @IsOptional()
  @IsIn(['ACTIVE', 'SUPERSEDED'])
  status?: MemoryStatus;

  @IsOptional()
  @IsIn(['preference', 'fact', 'goal'])
  kind?: MemoryKind;

  @IsOptional()
  @Transform(normalizeQuery)
  @IsString()
  @MaxLength(MEMORY_QUERY_MAX_LENGTH, {
    message: `搜索关键词最多 ${MEMORY_QUERY_MAX_LENGTH} 个字符`,
  })
  q?: string;

  /**
   * page 与 pageSize 必须成对理解：两者都不传时才走"返回全量"的兼容路径，
   * 小程序依赖 items.length 统计条数与满仓状态，不能被默认分页截断。
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MEMORY_PAGE_SIZE_MAX)
  pageSize?: number;
}
