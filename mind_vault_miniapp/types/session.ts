export interface UserSession {
  accessToken: string;
  user: {
    id: string;
    nickname?: string;
  };
}
