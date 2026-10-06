import type { EntityType, RelationType } from '@/types/domain';

export const ENTITY_TYPE_ORDER: EntityType[] = [
  'TECHNOLOGY',
  'PROJECT',
  'CONCEPT',
  'PERSON',
  'ORGANIZATION',
  'EVENT',
];

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  TECHNOLOGY: '技术',
  PROJECT: '项目',
  CONCEPT: '概念',
  PERSON: '人物',
  ORGANIZATION: '组织',
  EVENT: '事件',
};

/** 取值来自现有色板，保证与暖纸书房主题一致（见设计方案 4.5.3）。 */
export const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  TECHNOLOGY: 'var(--mv-graph-tech)',
  PROJECT: 'var(--mv-graph-project)',
  CONCEPT: 'var(--mv-graph-concept)',
  PERSON: 'var(--mv-graph-person)',
  ORGANIZATION: 'var(--mv-graph-org)',
  EVENT: 'var(--mv-graph-event)',
};

export const RELATION_TYPE_ORDER: RelationType[] = [
  'USES',
  'USED_FOR',
  'DEPENDS_ON',
  'CAUSES',
  'RELATED_TO',
  'PART_OF',
  'CREATED_BY',
  'MENTIONED_WITH',
];

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  USES: '使用',
  USED_FOR: '用于',
  DEPENDS_ON: '依赖',
  CAUSES: '导致',
  RELATED_TO: '相关',
  PART_OF: '属于',
  CREATED_BY: '创建者',
  MENTIONED_WITH: '共同出现',
};
