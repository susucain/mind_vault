import { ApiError } from '../types/api';

export function showRequestError(error: unknown) {
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
      ? (error as ApiError).message
      : '请求失败，请稍后重试';
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2400,
  });
}
