import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** 展示型字段：32 位已足够，过长会撑破顶栏与卡片一行 */
export const NICKNAME_MAX_LENGTH = 32;

export class UpdateNicknameDto {
  // 先 trim 再校验，让长度上限真正作用在落库的值上
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: '昵称不能为空' })
  @MaxLength(NICKNAME_MAX_LENGTH, {
    message: `昵称最多 ${NICKNAME_MAX_LENGTH} 个字符`,
  })
  nickname: string;
}
