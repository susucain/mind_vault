import { AuthService } from './auth.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  it('creates a development token with the requested user identity', () => {
    const tokens = new TokenService('test-secret');
    const service = new AuthService(tokens, {
      get: jest.fn().mockReturnValue(true),
    } as never);

    const result = service.devLogin('10001', '开发用户');
    const payload = tokens.verify(result.accessToken);

    expect(payload.sub).toBe('10001');
    expect(payload.nickname).toBe('开发用户');
    expect(result.user).toEqual({ id: '10001', nickname: '开发用户' });
  });

  it('rejects development login when it is disabled', () => {
    const tokens = new TokenService('test-secret');
    const service = new AuthService(tokens, {
      get: jest.fn().mockReturnValue(false),
    } as never);

    expect(() => service.devLogin('10001')).toThrow('开发登录已禁用');
  });
});
