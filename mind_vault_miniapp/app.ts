import { loadSession } from './utils/session';
import { AppOption } from './types/app';

App<AppOption>({
  globalData: {
    session: loadSession(),
    network: {
      isOnline: true,
      networkType: 'unknown',
    },
  },

  onLaunch() {
    this.globalData.session = loadSession();
    wx.getNetworkType({
      success: (result) => {
        this.globalData.network = {
          isOnline: result.networkType !== 'none',
          networkType:
            result.networkType as AppOption['globalData']['network']['networkType'],
        };
      },
    });
    wx.onNetworkStatusChange((result) => {
      this.globalData.network = {
        isOnline: result.isConnected,
        networkType:
          result.networkType as AppOption['globalData']['network']['networkType'],
      };
      if (!result.isConnected) {
        wx.showToast({
          title: '当前网络不可用',
          icon: 'none',
        });
      }
    });
  },
});
