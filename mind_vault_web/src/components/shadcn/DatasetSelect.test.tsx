import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DatasetSelect } from './DatasetSelect';

const datasets = [
  { id: 'd1', name: '面试准备', documentCount: 8, createdAt: '2026-09-01', updatedAt: '2026-09-29' },
  { id: 'd2', name: '技术资料', documentCount: 14, createdAt: '2026-09-01', updatedAt: '2026-09-28' },
];

describe('DatasetSelect', () => {
  it('未选择时显示 placeholder', () => {
    render(<DatasetSelect datasets={datasets} onChange={vi.fn()} value="" />);

    expect(screen.getByText('请选择资料集')).toBeInTheDocument();
  });

  it('已选择时触发器只回显名称，不带文件数量', () => {
    render(<DatasetSelect datasets={datasets} onChange={vi.fn()} value="d2" />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('技术资料');
    expect(trigger).not.toHaveTextContent('份资料');
  });

  it('展开后选择另一资料集时回传其 id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatasetSelect datasets={datasets} onChange={onChange} value="d1" />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /技术资料/ }));

    expect(onChange).toHaveBeenCalledWith('d2');
  });

  it('searchable 模式下按名称筛选后选中', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatasetSelect datasets={datasets} onChange={onChange} searchable value="" />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('搜索资料集…'), '技术');
    await user.click(await screen.findByRole('option', { name: /技术资料/ }));

    expect(onChange).toHaveBeenCalledWith('d2');
  });

  it('searchable 模式下无匹配项时给出空态', async () => {
    const user = userEvent.setup();
    render(<DatasetSelect datasets={datasets} onChange={vi.fn()} searchable value="" />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('搜索资料集…'), '不存在的资料集');

    expect(await screen.findByText('没有匹配的资料集')).toBeInTheDocument();
  });
});