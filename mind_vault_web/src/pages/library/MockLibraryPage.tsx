import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import {
  createFolder,
  createTag,
  deleteFolder,
  deleteTag,
  listFolders,
  listTags,
  updateFolder,
  updateTag,
  type Folder as FolderItem,
  type Tag,
} from '../../api/documents';
import { Button, Dialog, EmptyState, Input, LoadingState, StatusBadge } from '../../components/ui';
import { LibraryNav } from '../../features/library/LibraryNav';
import { appConfig } from '../../lib/config';

type Kind = 'folders' | 'tags';

const copy = {
  folders: { title: '文件夹', singular: '文件夹', Icon: Folder, description: '文件夹后端接口尚未提供。' },
  tags: { title: '标签', singular: '标签', Icon: Tags, description: '标签后端接口尚未提供。' },
};

export function MockLibraryPage({ kind }: { kind: Kind }) {
  const config = copy[kind];
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FolderItem | Tag>();
  const [name, setName] = useState('');
  const queryKey = ['library-mock-adapter', kind];
  const query = useQuery({
    enabled: appConfig.enableMockApi,
    queryKey,
    queryFn: async () => {
      if (kind === 'folders') return listFolders();
      return listTags();
    },
    retry: false,
  });
  const save = useMutation({
    mutationFn: () => {
      const input = { name: name.trim() };
      if (kind === 'folders') return editing ? updateFolder(editing.id, input) : createFolder(input);
      return editing ? updateTag(editing.id, input) : createTag(input);
    },
    onSuccess: async () => {
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => kind === 'folders' ? deleteFolder(id) : deleteTag(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function openCreate() {
    setEditing(undefined);
    setName('');
    setDialogOpen(true);
  }

  function openEdit(item: FolderItem | Tag) {
    setEditing(item);
    setName(item.name);
    setDialogOpen(true);
  }

  return (
    <section className="page-section">
      <header className="page-heading">
        <div><p className="eyebrow">知识库</p><h1>{config.title}</h1></div>
        <div className="heading-actions">
          <StatusBadge tone="warning">{appConfig.enableMockApi ? '模拟数据' : '暂不支持'}</StatusBadge>
          <Button disabled={!appConfig.enableMockApi} onClick={openCreate}><Plus size={17} />新建{config.singular}</Button>
        </div>
      </header>
      <LibraryNav />
      <div className="capability-notice" role="status"><config.Icon size={18} /><div><strong>{config.description}</strong><span>{appConfig.enableMockApi ? '当前内容来自前端 mock adapter，不代表真实服务数据。' : '启用 VITE_ENABLE_MOCK_API 可查看交互演示。'}</span></div></div>
      {!appConfig.enableMockApi ? (
        <EmptyState description={`${config.title}服务尚未提供，相关操作已禁用。`} title={`暂不支持${config.title}`} />
      ) : query.isPending ? <LoadingState label={`加载${config.title}`} /> : query.data?.length ? (
        <div className="mock-list">{query.data.map((item) => <div key={item.id}>
          <config.Icon size={18} /><span>{item.name}</span>
          <div className="mock-list__actions">
            <button aria-label={`重命名 ${item.name}`} className="icon-button" onClick={() => openEdit(item)} type="button"><Pencil size={16} /></button>
            <button aria-label={`删除 ${item.name}`} className="icon-button" onClick={() => {
              if (window.confirm(`删除${config.singular}“${item.name}”？`)) remove.mutate(item.id);
            }} type="button"><Trash2 size={16} /></button>
          </div>
        </div>)}</div>
      ) : <EmptyState description="此页面不会把未实现的服务能力伪装成真实数据。" title={`暂无${config.title}数据`} />}
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen} title={`${editing ? '重命名' : '新建'}${config.singular}`}>
        <form className="dialog-form" onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) save.mutate();
        }}>
          <label>{config.singular}名称<Input aria-label={`${config.singular}名称`} autoFocus onChange={(event) => setName(event.target.value)} value={name} /></label>
          <div className="dialog-actions">
            <Button disabled={!name.trim() || save.isPending} type="submit">{editing ? '保存' : '创建'}</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
