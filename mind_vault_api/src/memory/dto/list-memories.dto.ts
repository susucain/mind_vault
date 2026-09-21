import { IsIn, IsOptional } from 'class-validator';
import type { MemoryStatus } from '../memory.types';

export class ListMemoriesDto {
  /** 缺省只返回生效中的记忆；SUPERSEDED 用于查看被自动取代的历史 */
  @IsOptional()
  @IsIn(['ACTIVE', 'SUPERSEDED'])
  status?: MemoryStatus;
}
