import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { USERNAME_PATTERN } from './register.dto';

/** 先 trim 再校验：@Matches 默认作用在原始串上，前后空格会让归一化逻辑变成死代码 */
const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateUsernameDto {
  @Transform(trimmed)
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message: '用户名需为 3-64 位字母、数字、下划线或中划线',
  })
  username: string;

  // 改登录名属于高危操作：服务端必须校验当前密码，前端弹窗里的输入不是摆设
  @IsString()
  @MinLength(1, { message: '请输入当前密码' })
  @MaxLength(128, { message: '密码过长' })
  currentPassword: string;
}
