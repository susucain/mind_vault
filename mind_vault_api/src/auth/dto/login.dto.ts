import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '请输入用户名' })
  @MaxLength(64, { message: '用户名过长' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '请输入密码' })
  @MaxLength(128, { message: '密码过长' })
  password: string;
}
