import { Search } from 'lucide-react';
import { Button } from '@/components/ui';
import { MAX_QUERY_LENGTH } from '../retrieval-schema';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  hint?: string;
  /** 触发检索的历史请求进行中，用于按钮 loading 态 */
  busy?: boolean;
}

/** 受控检索输入框：草稿由页面持有并防抖写 URL，这里只负责输入与提交。 */
export function SearchBar({ value, onChange, onSubmit, placeholder, hint, busy }: SearchBarProps) {
  return (
    <form
      className="retrieval-search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      role="search"
    >
      <div className="retrieval-search__row">
        <Search aria-hidden="true" className="retrieval-search__icon" size={16} />
        <input
          aria-label="检索内容"
          autoComplete="off"
          className="input retrieval-search__input"
          maxLength={MAX_QUERY_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
        <Button disabled={!value.trim() || busy} type="submit">
          {busy ? '检索中…' : '检索'}
        </Button>
      </div>
      {hint ? <p className="retrieval-search__hint">{hint}</p> : null}
    </form>
  );
}
