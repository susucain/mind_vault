import { Conversation } from '../types/chat';
import { InterviewSession } from '../types/interview';
import { Dataset } from '../types/api';
import { SessionKind, SessionListItem } from '../types/session-list';

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
    title: `${modeLabel(session.mode)} · 第 ${Math.min(session.currentIndex + 1, session.totalQuestions)} 题`,
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

function modeLabel(mode: InterviewSession['mode']) {
  const labels: Record<InterviewSession['mode'], string> = {
    project_deep_dive: '项目深挖',
    quick_qa: '快速问答',
    technical: '技术面试',
    behavioral: '行为面试',
  };
  return labels[mode];
}
