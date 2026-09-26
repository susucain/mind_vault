jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));
jest.mock('../auth/current-user.decorator', () => ({
  CurrentUser: () => () => undefined,
}));

import { InterviewController } from './interview.controller';

describe('InterviewController', () => {
  it('forwards review item pagination query parameters to the service', async () => {
    const result = { items: [], total: 0, page: 2, pageSize: 2 };
    const service = {
      listReviewItems: jest.fn().mockResolvedValue(result),
    };
    const controller = new InterviewController(service as never);
    const query = { status: 'COMPLETED' as const, page: 2, pageSize: 2 };

    await expect(
      controller.listReviewItems({ id: 'user_1' }, query),
    ).resolves.toBe(result);
    expect(service.listReviewItems).toHaveBeenCalledWith('user_1', query);
  });
});
