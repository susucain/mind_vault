import { Conversation } from '../types/chat';
import { InterviewSession } from '../types/interview';
import { Dataset } from '../types/api';
import { SessionKind, SessionListItem } from '../types/session-list';
import { intensityLabel, topicLabel } from './interview-labels';

export function mergeSessionItems(
  conversations: Conversation[],
  interviews: InterviewSession[],
  datasets: Dataset[]
): SessionListItem[] {
  return [
    ...conversations.map(toChatSessionItem),
    ...interviews.map((session) => toInterviewSessionItem(session, datasets)),
  ].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}

export function toChatSessionItem(conversation: Conversation): SessionListItem {
  return {
    id: conversation.id,
    kind: 'chat',
    title: conversation.title,
    subtitle: `${conversation.datasetIds.length} 个资料集`,
    updatedAt: conversation.updatedAt,
  };
}

export function toInterviewSessionItem(
  session: InterviewSession,
  datasets: Dataset[]
): SessionListItem {
  const dataset = datasets.find((item) => item.id === session.datasetId);
  return {
    id: session.id,
    kind: 'interview',
    title: `${topicLabel(session.topic)} · ${intensityLabel(session.intensity)} · 第 ${Math.min(session.currentIndex + 1, session.totalQuestions)} 题`,
    subtitle: dataset?.name ?? '未知资料集',
    updatedAt: session.updatedAt,
    status: session.status,
  };
}

export function filterSessions(
  items: SessionListItem[],
  kind: SessionKind | 'all'
) {
  return kind === 'all' ? items : items.filter((item) => item.kind === kind);
}

export function recentSessions(items: SessionListItem[], count = 3) {
  return items.slice(0, count);
}

export function allDatasetIds(datasets: Dataset[]) {
  return datasets.map((dataset) => dataset.id);
}
