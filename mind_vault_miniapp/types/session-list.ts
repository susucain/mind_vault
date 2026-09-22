export type SessionKind = 'chat' | 'interview';

export interface SessionListItem {
  id: string;
  kind: SessionKind;
  title: string;
  subtitle: string;
  updatedAt: string;
  status?: 'IN_PROGRESS' | 'COMPLETED';
}
