import { loadSession } from './utils/session';
import { AppOption } from './types/app';

App<AppOption>({
  globalData: {
    session: loadSession(),
  },

  onLaunch() {
    this.globalData.session = loadSession();
  },
});
