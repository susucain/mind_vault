import { ApiError } from '../types/api';
import { AppOption } from '../types/app';

export function showRequestError(error: unknown) {
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
      ? (error as ApiError).message
      : '请求失败，请稍后重试';
  wx.showToast({
    title: getApp<AppOption>().globalData.network.isOnline
      ? message
      : '当前网络不可用',
    icon: 'none',
    duration: 2400,
  });
}
