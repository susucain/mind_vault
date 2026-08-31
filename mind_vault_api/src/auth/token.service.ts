import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

export interface TokenPayload {
  sub: string;
  nickname?: string;
  iat: number;
  exp: number;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64url')
    .replace(/=+$/g, '');
}

function decode<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

export class TokenService {
  constructor(private readonly secret: string) {}

  sign(
    payload: Omit<TokenPayload, 'iat' | 'exp'>,
    expiresInSeconds = 7 * 24 * 60 * 60,
  ): string {
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const body = encode({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
    const signature = createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  verify(token: string): TokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('无效的访问令牌');
    }

    const expected = createHmac('sha256', this.secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new UnauthorizedException('无效的访问令牌');
    }

    const payload = decode<TokenPayload>(parts[1]);
    if (!payload.sub || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('访问令牌已过期');
    }
    return payload;
  }
}
