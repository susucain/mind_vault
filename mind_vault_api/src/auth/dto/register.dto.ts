import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;

export class RegisterDto {
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message: '用户名需为 3-64 位字母、数字、下划线或中划线',
  })
  username: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128, { message: '密码过长' })
  password: string;
}
