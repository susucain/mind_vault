import type { RetrievalMode } from '@/types/domain';

/** 阶段 2 提供关键字 / 语义两路，阶段 3 接入图谱；混合排序待后续阶段。 */
export const MODE_TABS: { value: RetrievalMode; label: string }[] = [
  { value: 'keyword', label: '关键字' },
  { value: 'vector', label: '语义' },
  { value: 'graph', label: '图谱' },
];

export const MODE_LABELS: Record<RetrievalMode, string> = {
  keyword: '关键字',
  vector: '语义',
  graph: '图谱',
  hybrid: '混合',
};

export const MODE_PLACEHOLDER: Record<RetrievalMode, string> = {
  keyword: '输入关键词或短语，用 "" 包裹可精确匹配',
  vector: '用一句话描述你想找的内容',
  graph: '输入实体名称',
  hybrid: '输入关键词或一句话描述',
};

export const MODE_HINT: Record<RetrievalMode, string> = {
  keyword: '不加引号走模糊匹配，加 "" 走精确短语匹配。',
  vector: '语义检索理解含义而非字面，适合用自然语言描述。',
  graph: '按实体之间的关系查找相关内容。',
  hybrid: '关键字、语义与图谱结果融合排序。',
};
