import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  devLogin(userId: string, nickname = '开发用户') {
    if (!this.config.get<boolean>('auth.devLoginEnabled', true)) {
      throw new ForbiddenException('开发登录已禁用');
    }

    return {
      accessToken: this.tokens.sign({ sub: userId, nickname }),
      user: { id: userId, nickname },
    };
  }
}
