const PENDING_INTERVIEW_SESSION_KEY = 'mind-vault-pending-interview-session';

export function rememberInterviewSessionId(sessionId: string) {
  wx.setStorageSync(PENDING_INTERVIEW_SESSION_KEY, sessionId);
}

export function consumePendingInterviewSessionId() {
  const value = wx.getStorageSync(PENDING_INTERVIEW_SESSION_KEY);
  wx.removeStorageSync(PENDING_INTERVIEW_SESSION_KEY);
  return typeof value === 'string' ? value : '';
}
