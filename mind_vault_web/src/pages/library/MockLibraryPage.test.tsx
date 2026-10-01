import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createFolder, deleteFolder, listFolders, updateFolder } from '../../api/documents';
import { MockLibraryPage } from './MockLibraryPage';

vi.mock('../../lib/config', () => ({ appConfig: { enableMockApi: true } }));
vi.mock('../../api/documents', () => ({
  listFolders: vi.fn().mockResolvedValue([{ id: 'folder-1', name: '求职准备' }]),
  createFolder: vi.fn().mockResolvedValue({ id: 'folder-2', name: '项目资料' }),
  updateFolder: vi.fn().mockResolvedValue({ id: 'folder-1', name: '面试准备' }),
  deleteFolder: vi.fn().mockResolvedValue(undefined),
  listTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><MockLibraryPage kind="folders" /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MockLibraryPage CRUD', () => {
  it('creates, renames and deletes a folder through the adapter', async () => {
    renderPage();
    expect(await screen.findByText('求职准备')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '新建文件夹' }));
    await userEvent.type(screen.getByLabelText('文件夹名称'), '项目资料');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith({ name: '项目资料' }));

    await userEvent.click(screen.getByRole('button', { name: '重命名 求职准备' }));
    await userEvent.clear(screen.getByLabelText('文件夹名称'));
    await userEvent.type(screen.getByLabelText('文件夹名称'), '面试准备');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(updateFolder).toHaveBeenCalledWith('folder-1', { name: '面试准备' }));

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: '删除 求职准备' }));
    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith('folder-1'));
    expect(listFolders).toHaveBeenCalled();
  });
});
