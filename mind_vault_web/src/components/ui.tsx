import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Command, LoaderCircle, X } from 'lucide-react';
import { clsx } from 'clsx';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button className={clsx('button', `button--${variant}`, className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('input', className)} {...props} />;
}

export interface TabItem {
  value: string;
  label: string;
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          aria-selected={item.value === value}
          className="tab"
          key={item.value}
          onClick={() => onChange(item.value)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  children,
  open,
  onOpenChange,
  title,
  trigger,
}: PropsWithChildren<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  trigger?: ReactNode;
}>) {
  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="dialog-content">
          <div className="dialog-header">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close dialog" className="icon-button">
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Drawer({
  children,
  onOpenChange,
  open,
  side = 'right',
  title,
  trigger,
}: PropsWithChildren<{
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  side?: 'right' | 'bottom';
  title: string;
  trigger?: ReactNode;
}>) {
  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay" />
        <DialogPrimitive.Content className="drawer-content" data-side={side}>
          <div className="dialog-header">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="关闭抽屉" className="icon-button">
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Tooltip({ children, content }: PropsWithChildren<{ content: string }>) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="tooltip" sideOffset={6}>
            {content}
            <TooltipPrimitive.Arrow className="tooltip-arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' }>) {
  return <span className={clsx('status-badge', `status-badge--${tone}`)}>{children}</span>;
}

export function EmptyState({ action, description, title }: { action?: ReactNode; description: string; title: string }) {
  return (
    <section className="state-panel">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function ErrorState({ onRetry, title = 'Something went wrong' }: { onRetry?: () => void; title?: string }) {
  return (
    <section className="state-panel state-panel--error" role="alert">
      <h2>{title}</h2>
      {onRetry ? <Button onClick={onRetry} variant="secondary">Try again</Button> : null}
    </section>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div aria-label={label} className="loading-state" role="status">
      <LoaderCircle aria-hidden="true" size={20} />
      <span>{label}</span>
    </div>
  );
}

export function CommandMenu({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Command menu">
      <div className="command-menu">
        <Command aria-hidden="true" size={18} />
        <Input aria-label="Search commands" autoFocus placeholder="Search commands" />
      </div>
    </Dialog>
  );
}
