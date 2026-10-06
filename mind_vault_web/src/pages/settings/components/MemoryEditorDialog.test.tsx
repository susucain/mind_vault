import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Memory } from '../../../api/memories';
import { MemoryEditorDialog } from './MemoryEditorDialog';

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'm1',
    content: '偏好用 TypeScript 写后端',
    kind: 'preference',
    status: 'ACTIVE',
    hitCount: 0,
    lastUsedAt: null,
    sourceConversationId: null,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

function renderDialog(props: Partial<Parameters<typeof MemoryEditorDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MemoryEditorDialog onOpenChange={onOpenChange} onSubmit={onSubmit} open {...props} />,
  );
  return { onSubmit, onOpenChange };
}

describe('MemoryEditorDialog', () => {
  it('counts characters as the user types', () => {
    renderDialog();

    expect(screen.getByText('0/200')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('记忆内容'), { target: { value: '专注后端' } });

    expect(screen.getByText('4/200')).toBeInTheDocument();
  });

  it('prefills the form when editing an existing memory', () => {
    renderDialog({ initial: makeMemory() });

    expect(screen.getByRole('heading', { name: '编辑记忆' })).toBeInTheDocument();
    expect(screen.getByLabelText('记忆内容')).toHaveValue('偏好用 TypeScript 写后端');
    expect(screen.getByRole('button', { name: '偏好' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('blocks submit when the content is empty', () => {
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '新增' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('请输入记忆内容');
  });

  it('blocks an over-limit content that bypassed maxlength', () => {
    const { onSubmit } = renderDialog();

    fireEvent.change(screen.getByLabelText('记忆内容'), { target: { value: 'a'.repeat(201) } });

    expect(screen.getByRole('button', { name: '新增' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '新增' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed content with the selected kind', () => {
    const { onSubmit } = renderDialog();

    fireEvent.change(screen.getByLabelText('记忆内容'), { target: { value: '  偏好短回答  ' } });
    fireEvent.click(screen.getByRole('button', { name: '目标' }));
    fireEvent.click(screen.getByRole('button', { name: '新增' }));

    expect(onSubmit).toHaveBeenCalledWith({ content: '偏好短回答', kind: 'goal' });
  });

  it('disables the submit button while pending', () => {
    renderDialog({ pending: true });

    fireEvent.change(screen.getByLabelText('记忆内容'), { target: { value: '有效内容' } });

    expect(screen.getByRole('button', { name: '新增' })).toBeDisabled();
  });
});