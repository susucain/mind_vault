jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  function contextWithToken(token: string) {
    const request: {
      headers: { authorization: string };
      user?: { id: string; nickname?: string };
    } = {
      headers: { authorization: `Bearer ${token}` },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('adds the verified JWT identity to the request', () => {
    const verify = jest
      .fn()
      .mockReturnValue({ sub: '10001', nickname: '开发用户' });
    const jwt = {
      verify,
    } as unknown as JwtService;
    const guard = new AuthGuard(jwt);
    const { context, request } = contextWithToken('valid-token');

    expect(guard.canActivate(context)).toBe(true);
    expect(verify).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual({
      id: '10001',
      nickname: '开发用户',
    });
  });

  it('maps JWT verification failures to an unauthorized response', () => {
    const verify = jest.fn(() => {
      throw new Error('invalid signature');
    });
    const jwt = {
      verify,
    } as unknown as JwtService;
    const guard = new AuthGuard(jwt);

    expect(() =>
      guard.canActivate(contextWithToken('invalid-token').context),
    ).toThrow(UnauthorizedException);
  });
});
