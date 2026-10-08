import { useState } from 'react';
import {
  MAX_HOPS_OPTIONS,
  PAGE_SIZE_OPTIONS,
  TIME_RANGE_OPTIONS,
  matchTimeRange,
  timeRangeBounds,
  type RetrievalQueryState,
  type TimeRange,
} from '../retrieval-schema';

interface AdvancedOptionsProps {
  state: RetrievalQueryState;
  onChange: (patch: Partial<RetrievalQueryState>) => void;
}

/**
 * 高级选项默认收起，展开为一行；条件变化即时写回 URL 并重新检索。
 *
 * 入口按钮暂时隐藏（模板见下方注释），因此面板当前不可达；保留 open 状态与面板代码，
 * 便于后续改回按钮开关或改为常驻展开。
 */
export function AdvancedOptions({ state, onChange }: AdvancedOptionsProps) {
  const [open] = useState(false);
  const activeRange = matchTimeRange(state.from, state.to) ?? 'all';

  return (
    <div className="retrieval-advanced">
      {/* 入口按钮（暂时隐藏）：
      <Button
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
        variant="secondary"
      >
        <SlidersHorizontal aria-hidden="true" size={15} />
        高级选项
      </Button>
      */}
      {open ? (
        <div className="retrieval-advanced__panel">
          <label className="retrieval-field">
            <span>时间范围</span>
            <select
              aria-label="时间范围"
              onChange={(event) => onChange(timeRangeBounds(event.target.value as TimeRange))}
              value={activeRange}
            >
              {TIME_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="retrieval-field">
            <span>每页结果</span>
            <select
              aria-label="每页结果"
              onChange={(event) => onChange({ pageSize: Number(event.target.value) })}
              value={state.pageSize}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} 条
                </option>
              ))}
            </select>
          </label>
          <label className="retrieval-field">
            <span>排序</span>
            <select
              aria-label="排序"
              onChange={(event) => onChange({ sort: event.target.value as RetrievalQueryState['sort'] })}
              value={state.sort}
            >
              <option value="relevance">相关度优先</option>
              <option value="recent">最新优先</option>
            </select>
          </label>
          {state.mode === 'graph' ? (
            <label className="retrieval-field">
              <span>图谱跳数</span>
              <select
                aria-label="图谱跳数"
                onChange={(event) => onChange({ maxHops: Number(event.target.value) })}
                value={state.maxHops}
              >
                {MAX_HOPS_OPTIONS.map((hops) => (
                  <option key={hops} value={hops}>
                    {hops} 跳
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
