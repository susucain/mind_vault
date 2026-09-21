import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { memoryConfig } from '../memory.types';
import type { MemoryKind, MemoryStatus } from '../memory.types';

export class UpdateMemoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(memoryConfig.maxContentChars)
  content?: string;

  @IsOptional()
  @IsIn(['preference', 'fact', 'goal'])
  kind?: MemoryKind;

  /** 置回 ACTIVE 用于恢复一条被自动取代的记忆 */
  @IsOptional()
  @IsIn(['ACTIVE', 'SUPERSEDED'])
  status?: MemoryStatus;
}
