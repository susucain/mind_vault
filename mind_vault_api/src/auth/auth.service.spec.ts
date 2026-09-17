jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  it('creates a development token with the requested user identity', () => {
    const sign = jest.fn().mockReturnValue('access-token');
    const jwt = {
      sign,
    } as unknown as JwtService;
    const service = new AuthService(jwt, {
      get: jest.fn().mockReturnValue(true),
    } as never);

    const result = service.devLogin('10001', '开发用户');

    expect(sign).toHaveBeenCalledWith(
      { sub: '10001', nickname: '开发用户' },
      { expiresIn: '7d' },
    );
    expect(result.accessToken).toBe('access-token');
    expect(result.user).toEqual({ id: '10001', nickname: '开发用户' });
  });

  it('rejects development login when it is disabled', () => {
    const sign = jest.fn();
    const jwt = {
      sign,
    } as unknown as JwtService;
    const service = new AuthService(jwt, {
      get: jest.fn().mockReturnValue(false),
    } as never);

    expect(() => service.devLogin('10001')).toThrow('开发登录已禁用');
    expect(sign).not.toHaveBeenCalled();
  });
});
