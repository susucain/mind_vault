import { useState } from 'react';
import { Filter } from 'lucide-react';
import type { EntityType, RelationType } from '@/types/domain';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/ui/popover';
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_ORDER,
  RELATION_TYPE_LABELS,
  RELATION_TYPE_ORDER,
} from '../graph-meta';
import { emptyGraphFilters, type GraphFilters } from '../graph-model';

interface GraphFilterBarProps {
  filters: GraphFilters;
  onChange: (filters: GraphFilters) => void;
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** 类型过滤只在前端生效：改变筛选不会重新请求后端；低置信开关会触发重新请求（G4）。 */
export function GraphFilterBar({ filters, onChange }: GraphFilterBarProps) {
  const [open, setOpen] = useState(false);
  const activeCount =
    filters.entityTypes.length + filters.relationTypes.length + (filters.showLowConfidence ? 1 : 0);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button aria-label="图谱筛选" className="button button--secondary" type="button">
          <Filter aria-hidden="true" size={14} />
          筛选{activeCount ? ` (${activeCount})` : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="graph-filter">
          <div className="graph-filter__head">
            <span>筛选</span>
            <button
              disabled={activeCount === 0}
              onClick={() => onChange(emptyGraphFilters())}
              type="button"
            >
              重置
            </button>
          </div>
          <div className="graph-filter__body">
            <p className="graph-filter__group">实体类型</p>
            <div className="graph-filter__options">
              {ENTITY_TYPE_ORDER.map((type: EntityType) => (
                <label className="graph-filter__option" key={type}>
                  <input
                    checked={filters.entityTypes.includes(type)}
                    onChange={() => onChange({ ...filters, entityTypes: toggle(filters.entityTypes, type) })}
                    type="checkbox"
                  />
                  <span>{ENTITY_TYPE_LABELS[type]}</span>
                </label>
              ))}
            </div>
            <p className="graph-filter__group">关系类型</p>
            <div className="graph-filter__options">
              {RELATION_TYPE_ORDER.map((type: RelationType) => (
                <label className="graph-filter__option" key={type}>
                  <input
                    checked={filters.relationTypes.includes(type)}
                    onChange={() => onChange({ ...filters, relationTypes: toggle(filters.relationTypes, type) })}
                    type="checkbox"
                  />
                  <span>{RELATION_TYPE_LABELS[type]}</span>
                </label>
              ))}
            </div>
            <p className="graph-filter__group">关系置信</p>
            <div className="graph-filter__options">
              <label className="graph-filter__option">
                <input
                  checked={filters.showLowConfidence}
                  onChange={() => onChange({ ...filters, showLowConfidence: !filters.showLowConfidence })}
                  type="checkbox"
                />
                <span>显示低置信关系</span>
              </label>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
