import { UserSession } from './session';

export type NetworkType =
  '2g' | '3g' | '4g' | '5g' | 'wifi' | 'none' | 'unknown';

export interface AppOption {
  globalData: {
    session: UserSession | null;
    network: {
      isOnline: boolean;
      networkType: NetworkType;
    };
  };
}
