import { useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button, Dialog } from '../../../components/ui';
import type { Memory, MemoryKind } from '../../../api/memories';
import { MEMORY_CONTENT_MAX, validateMemoryContent } from '../../../features/settings/settings-schema';
import { MEMORY_KIND_LABEL, MEMORY_KIND_ORDER } from '../../../features/settings/settings-labels';

export interface MemoryDraft {
  content: string;
  kind: MemoryKind;
}

/**
 * 新增 / 编辑记忆。组件由父级按需挂载（打开才渲染），因此内部 state 天然重置，
 * 不需要额外的 open 变化同步逻辑。
 */
export function MemoryEditorDialog({
  error,
  initial,
  onOpenChange,
  onSubmit,
  open,
  pending = false,
}: {
  /** 服务端返回的错误文案 */
  error?: string | null;
  initial?: Memory;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: MemoryDraft) => void;
  open: boolean;
  pending?: boolean;
}) {
  const [content, setContent] = useState(initial?.content ?? '');
  const [kind, setKind] = useState<MemoryKind>(initial?.kind ?? 'fact');
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = validateMemoryContent(content);
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError(null);
    onSubmit({ content: content.trim(), kind });
  }

  const message = localError ?? error;
  // maxlength 已挡住键入，这里兜住粘贴/程序化输入等绕过途径
  const overLimit = content.trim().length > MEMORY_CONTENT_MAX;

  return (
    <Dialog onOpenChange={onOpenChange} open={open} title={initial ? '编辑记忆' : '新增记忆'}>
      <form className="dialog-form" onSubmit={submit}>
        <div className="form-field">
          <div className="field-header">
            <label htmlFor="memory-content">记忆内容</label>
            <span className="field-hint">
              {content.length}/{MEMORY_CONTENT_MAX}
            </span>
          </div>
          <textarea
            className="memory-editor__textarea"
            id="memory-content"
            maxLength={MEMORY_CONTENT_MAX}
            onChange={(event) => {
              setContent(event.target.value);
              setLocalError(validateMemoryContent(event.target.value));
            }}
            placeholder="例如：偏好用 TypeScript 写后端"
            value={content}
          />
        </div>

        <div className="form-field">
          <div className="field-header">
            <span className="memory-editor__label">类型</span>
          </div>
          <div className="memory-filters" role="group" aria-label="记忆类型">
            {MEMORY_KIND_ORDER.map((option) => (
              <button
                aria-pressed={option === kind}
                className="memory-chip"
                key={option}
                onClick={() => setKind(option)}
                type="button"
              >
                {MEMORY_KIND_LABEL[option]}
              </button>
            ))}
          </div>
        </div>

        <p className="field-hint">记忆会随每轮提问交给模型，用来理解你的偏好和目标，不会被当作资料引用。</p>

        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}

        <div className="dialog-actions">
          <Button onClick={() => onOpenChange(false)} type="button" variant="secondary">
            取消
          </Button>
          <Button disabled={pending || overLimit} type="submit">
            {pending ? <LoaderCircle className="spin-icon" size={15} /> : null}
            {initial ? '保存' : '新增'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}