import type { Dataset, Document, InterviewSession, ReviewItem } from '../../types/domain';

export const mockDocuments: Document[] = [
  { id: 'mock-1', title: 'React 性能优化手册', status: 1, sourceFileExtension: 'pdf', sourceFileSize: '2840000', createdAt: '2026-09-29T08:00:00Z', tags: '前端,性能' },
  { id: 'mock-2', title: '分布式系统面试笔记', status: 1, sourceFileExtension: 'md', sourceFileSize: '186000', createdAt: '2026-09-28T08:00:00Z', tags: '面试,系统设计' },
  { id: 'mock-3', title: 'Q3 项目复盘', status: 0, sourceFileExtension: 'docx', sourceFileSize: '920000', createdAt: '2026-09-27T08:00:00Z', ingestionStage: 'embedding' },
];

export const mockDatasets: Dataset[] = [
  { id: 'mock-d1', name: '面试准备', description: '系统设计与项目经历', documentCount: 8, createdAt: '2026-09-01', updatedAt: '2026-09-29' },
  { id: 'mock-d2', name: '技术资料', description: '日常检索资料', documentCount: 14, createdAt: '2026-09-01', updatedAt: '2026-09-28' },
];

export const mockSessions: InterviewSession[] = [
  { id: 'mock-i1', datasetId: 'mock-d1', title: '系统设计训练', topic: 'system_design', status: 'active', answeredCount: 3, questionCount: 6, createdAt: '2026-09-29' },
];

export const mockReviewItems: ReviewItem[] = [
  { id: 'mock-r1', sourceTurnId: 'mock-turn-1', title: '解释缓存一致性策略', status: 'PENDING', reason: '补充一致性边界', createdAt: '2026-09-29', updatedAt: '2026-09-29' },
  { id: 'mock-r2', sourceTurnId: 'mock-turn-2', title: '设计限流系统', status: 'PENDING', reason: '补充限流取舍', createdAt: '2026-09-29', updatedAt: '2026-09-29' },
];
