import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  devLogin(userId: string, nickname = '开发用户') {
    if (!this.config.get<boolean>('auth.devLoginEnabled', true)) {
      throw new ForbiddenException('开发登录已禁用');
    }

    return {
      accessToken: this.jwt.sign(
        { sub: userId, nickname },
        { expiresIn: '7d' },
      ),
      user: { id: userId, nickname },
    };
  }
}
