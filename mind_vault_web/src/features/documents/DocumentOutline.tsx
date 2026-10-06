import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { DocumentSection } from '../../types/domain';
import { sectionDomId } from './document-utils';

/** 折叠时保留当前章节前后各若干条：长目录（真实文档可达 300+ 章）不再撑破首屏。 */
const COLLAPSED_WINDOW = 6;

interface DocumentOutlineNavProps {
  /** 当前滚动到的章节 `order`，用于联动高亮 */
  activeOrder?: number;
  onSelect: (order: number) => void;
  sections: DocumentSection[];
}

function labelOf(section: DocumentSection, index: number) {
  return section.heading || `章节 ${index + 1}`;
}

/**
 * 章节目录：搜索过滤 + 折叠 + 当前章节高亮。
 * 桌面侧栏与移动端抽屉共用同一份实现，避免两处行为漂移。
 */
export function DocumentOutlineNav({ activeOrder, onSelect, sections }: DocumentOutlineNavProps) {
  const [keyword, setKeyword] = useState('');
  const [expanded, setExpanded] = useState(false);
  const query = keyword.trim().toLowerCase();
  const activeIndex = sections.findIndex((section, index) => (section.order ?? index) === activeOrder);

  const items = useMemo(() => {
    const indexed = sections.map((section, index) => ({ index, order: section.order ?? index, section }));
    const matched = query
      ? indexed.filter(({ index, section }) => labelOf(section, index).toLowerCase().includes(query))
      : indexed;
    // 搜索时展示全部命中项；否则折叠到当前章节附近
    if (query || expanded || activeIndex < 0) return matched;
    return matched.filter(({ index }) => Math.abs(index - activeIndex) <= COLLAPSED_WINDOW);
  }, [activeIndex, expanded, query, sections]);

  const collapsed = !query && !expanded && items.length < sections.length;

  return (
    <div className="outline-nav">
      <label className="outline-nav__search">
        <Search aria-hidden="true" size={14} />
        <input
          aria-label="搜索章节"
          className="input"
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索章节"
          type="search"
          value={keyword}
        />
      </label>
      <ul aria-label="章节目录" className="outline-nav__list">
        {items.map(({ index, order, section }) => {
          const isActive = order === activeOrder;
          return (
            <li key={section.sectionId ?? order}>
              <a
                aria-current={isActive ? 'location' : undefined}
                className={isActive ? 'is-active' : undefined}
                href={`#${sectionDomId(order)}`}
                onClick={(event) => {
                  event.preventDefault();
                  onSelect(order);
                }}
              >
                {labelOf(section, index)}
              </a>
            </li>
          );
        })}
        {!items.length ? <li className="outline-nav__empty">没有匹配的章节</li> : null}
      </ul>
      {collapsed ? (
        <button className="outline-nav__toggle" onClick={() => setExpanded(true)} type="button">
          展开全部 {sections.length} 章
        </button>
      ) : null}
      {!query && expanded ? (
        <button className="outline-nav__toggle" onClick={() => setExpanded(false)} type="button">
          收起目录
        </button>
      ) : null}
    </div>
  );
}
