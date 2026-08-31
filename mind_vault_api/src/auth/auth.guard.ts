import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from './token.service';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    nickname?: string;
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Bearer 访问令牌');
    }
    const payload = this.tokens.verify(authorization.slice(7));
    request.user = { id: payload.sub, nickname: payload.nickname };
    return true;
  }
}
