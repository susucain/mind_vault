import { InterviewIntensity, InterviewTopic } from '../types/interview';

const topicLabels: Record<InterviewTopic, string> = {
  project_deep_dive: '项目深挖',
  technical_fundamentals: '技术基础',
  behavioral: '行为面试',
};

const intensityLabels: Record<InterviewIntensity, string> = {
  quick: '快速',
  deep: '深度',
};

export function topicLabel(topic: InterviewTopic) {
  return topicLabels[topic];
}

export function intensityLabel(intensity: InterviewIntensity) {
  return intensityLabels[intensity];
}
