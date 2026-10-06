import { useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button, Dialog, Input } from '../../../components/ui';

/**
 * 危险操作二次确认。删除记忆只要一次点击确认，清空整仓要求手打确认文本——
 * 误触代价不同，防护强度就该不同。
 */
export function DangerConfirmDialog({
  confirmLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  pending = false,
  requireText,
  title,
}: {
  confirmLabel: string;
  description: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  /** 传入后必须原样输入该文本才能提交 */
  requireText?: string;
  title: string;
}) {
  const [typed, setTyped] = useState('');
  const blocked = requireText ? typed.trim() !== requireText : false;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending) return;
    onConfirm();
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open} title={title}>
      <form className="dialog-form" onSubmit={submit}>
        <p className="muted">{description}</p>

        {requireText ? (
          <div className="form-field">
            <div className="field-header">
              <label htmlFor="danger-confirm">请输入「{requireText}」以确认</label>
            </div>
            <Input
              autoComplete="off"
              id="danger-confirm"
              onChange={(event) => setTyped(event.target.value)}
              placeholder={requireText}
              value={typed}
            />
          </div>
        ) : null}

        <div className="dialog-actions">
          <Button onClick={() => onOpenChange(false)} type="button" variant="secondary">
            取消
          </Button>
          <Button className="button--danger" disabled={blocked || pending} type="submit">
            {pending ? <LoaderCircle className="spin-icon" size={15} /> : null}
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}