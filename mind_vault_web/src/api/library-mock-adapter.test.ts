import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/config', () => ({ appConfig: { enableMockApi: true } }));

describe('library mock adapter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('supports complete folder and tag CRUD', async () => {
    const api = await import('./documents');

    const folder = await api.createFolder({ name: '新文件夹' });
    expect(await api.listFolders()).toContainEqual(folder);
    expect(await api.updateFolder(folder.id, { name: '已重命名' })).toMatchObject({ name: '已重命名' });
    await api.deleteFolder(folder.id);
    expect(await api.listFolders()).not.toContainEqual(expect.objectContaining({ id: folder.id }));

    const tag = await api.createTag({ name: '新标签' });
    expect(await api.listTags()).toContainEqual(tag);
    expect(await api.updateTag(tag.id, { name: '已更新标签' })).toMatchObject({ name: '已更新标签' });
    await api.deleteTag(tag.id);
    expect(await api.listTags()).not.toContainEqual(expect.objectContaining({ id: tag.id }));
  });

  it('lists, archives and restores documents through one adapter state', async () => {
    const api = await import('./documents');
    const initial = await api.listArchivedDocuments();

    await api.archiveDocument('mock-1', {
      title: 'React 性能优化手册',
      sourceFileExtension: 'pdf',
    });
    expect(await api.listArchivedDocuments()).toContainEqual(expect.objectContaining({
      id: 'mock-1',
      title: 'React 性能优化手册',
    }));

    await api.restoreArchivedDocument('mock-1');
    expect(await api.listArchivedDocuments()).toHaveLength(initial.length);
  });
});
