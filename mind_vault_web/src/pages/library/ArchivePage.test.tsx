import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { restoreArchivedDocument } from '../../api/documents';
import { ArchivePage } from './ArchivePage';

vi.mock('../../lib/config', () => ({ appConfig: { enableMockApi: true } }));
vi.mock('../../api/documents', () => ({ restoreArchivedDocument: vi.fn().mockResolvedValue(undefined) }));

describe('ArchivePage', () => {
  it('labels mock data and restores an archived file through the adapter', async () => {
    render(<MemoryRouter><ArchivePage /></MemoryRouter>);

    expect(screen.getByText('模拟数据')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '恢复 历史项目总结' }));

    expect(restoreArchivedDocument).toHaveBeenCalledWith('mock-archived-1');
    expect(screen.getByText('归档中没有文件')).toBeInTheDocument();
  });
});
