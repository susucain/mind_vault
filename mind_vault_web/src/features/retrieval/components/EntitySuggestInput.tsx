import { Sparkles } from 'lucide-react';
import { ENTITY_TYPE_LABELS } from '../graph-meta';
import { useEntitySuggestions } from '../queries';

interface EntitySuggestInputProps {
  /** 当前输入草稿（与检索输入框共用）；留空时展示热门实体 */
  value: string;
  enabled: boolean;
  /** 点击候选实体：回填输入并立即检索 */
  onPick: (entity: string) => void;
}

/** 图谱模式的实体联想：输入框下方常驻候选，留空展示热门实体（见设计方案 4.3.1）。 */
export function EntitySuggestInput({ value, enabled, onPick }: EntitySuggestInputProps) {
  const suggestions = useEntitySuggestions({ q: value, enabled, allowEmpty: true, limit: 12 });
  const items = suggestions.data?.items ?? [];
  if (!enabled || items.length === 0) return null;

  const empty = value.trim().length === 0;

  return (
    <div className="entity-suggest">
      <p className="entity-suggest__title">
        <Sparkles aria-hidden="true" size={13} />
        {empty ? '热门实体' : '匹配实体'}
      </p>
      <div className="entity-suggest__list">
        {items.map((item) => (
          <button className="entity-suggest__item" key={item.id} onClick={() => onPick(item.name)} type="button">
            <span className="entity-suggest__name">{item.name}</span>
            <span className="entity-suggest__type">{ENTITY_TYPE_LABELS[item.type]}</span>
            <span className="entity-suggest__count">{item.mentionCount}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
