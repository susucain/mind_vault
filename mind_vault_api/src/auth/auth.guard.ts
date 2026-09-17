import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    nickname?: string;
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Bearer 访问令牌');
    }
    let payload: { sub?: unknown; nickname?: unknown };
    try {
      payload = this.jwt.verify(authorization.slice(7));
    } catch {
      throw new UnauthorizedException('无效的访问令牌');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('无效的访问令牌');
    }
    request.user = {
      id: payload.sub,
      nickname:
        typeof payload.nickname === 'string' ? payload.nickname : undefined,
    };
    return true;
  }
}
