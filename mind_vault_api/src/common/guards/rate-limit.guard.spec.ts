import { ExecutionContext } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  it('rejects requests after the per-user window limit', () => {
    const guard = new RateLimitGuard();
    const request = { user: { id: 'user_1' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    for (let index = 0; index < 60; index += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
    expect(() => guard.canActivate(context)).toThrow(
      '请求过于频繁，请稍后再试',
    );
  });
});
