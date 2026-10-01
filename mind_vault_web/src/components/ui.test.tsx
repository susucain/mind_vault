import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button, Drawer } from './ui';

describe('Drawer', () => {
  it('opens a right edge sheet and closes it from its close control', async () => {
    const user = userEvent.setup();

    render(
      <Drawer title="Filters" trigger={<Button>Open filters</Button>}>
        <p>Drawer content</p>
      </Drawer>,
    );

    await user.click(screen.getByRole('button', { name: 'Open filters' }));

    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveAttribute('data-side', 'right');
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveClass('drawer-content');
    expect(screen.getByText('Drawer content')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭抽屉' }));

    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });
});
