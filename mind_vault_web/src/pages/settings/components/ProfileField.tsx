import type { ReactNode } from 'react';

/** 只读信息行：标签 + 值 + 可选操作。等宽值（如用户 ID）用 mono 变体。 */
export function ProfileField({
  action,
  children,
  label,
  mono = false,
}: {
  action?: ReactNode;
  children: ReactNode;
  label: string;
  mono?: boolean;
}) {
  return (
    <div className="settings-field-row">
      <span className="settings-field-row__label">{label}</span>
      <span className={`settings-field-row__value${mono ? ' settings-field-row__value--mono' : ''}`}>{children}</span>
      {action ? <span className="settings-field-row__action">{action}</span> : null}
    </div>
  );
}