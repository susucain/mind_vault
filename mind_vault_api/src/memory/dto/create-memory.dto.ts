import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { memoryConfig } from '../memory.types';
import type { MemoryKind } from '../memory.types';

export class CreateMemoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(memoryConfig.maxContentChars)
  content: string;

  /** preference：稳定偏好；fact：关于用户的事实；goal：当前目标。缺省按 fact 处理 */
  @IsOptional()
  @IsIn(['preference', 'fact', 'goal'])
  kind?: MemoryKind;

  /** 来源会话，用于追溯这条记忆是从哪次对话里来的 */
  @IsOptional()
  @IsString()
  sourceConversationId?: string;
}
