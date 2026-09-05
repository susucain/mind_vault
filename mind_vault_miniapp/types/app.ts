import { UserSession } from './session';

export interface AppOption {
  globalData: {
    session: UserSession | null;
  };
}
