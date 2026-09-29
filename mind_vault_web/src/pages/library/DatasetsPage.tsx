import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { createDataset, deleteDataset, updateDataset } from '../../api/datasets';
import { Button, EmptyState, LoadingState } from '../../components/ui';
import { DatasetDialog } from '../../features/datasets/DatasetDialog';
import type { DatasetFormValue } from '../../features/datasets/dataset-schema';
import { useDatasets } from '../../features/documents/queries';
import { LibraryNav } from '../../features/library/LibraryNav';
import type { Dataset } from '../../types/domain';

export function DatasetsPage() {
  const queryClient = useQueryClient();
  const datasets = useDatasets();
  const [editing, setEditing] = useState<Dataset>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const save = useMutation({
    mutationFn: ({ dataset, value }: { dataset?: Dataset; value: DatasetFormValue }) =>
      dataset ? updateDataset(dataset.id, value) : createDataset(value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasets'] }),
  });
  const remove = useMutation({
    mutationFn: deleteDataset,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasets'] }),
  });

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  return (
    <section className="page-section">
      <header className="page-heading">
        <div><p className="eyebrow">知识库</p><h1>资料集</h1></div>
        <Button onClick={openCreate}><Plus size={17} />新建资料集</Button>
      </header>
      <LibraryNav />
      {datasets.isPending ? <LoadingState label="加载资料集" /> : datasets.isError ? (
        <section className="state-panel state-panel--error"><h2>资料集加载失败</h2><Button onClick={() => void datasets.refetch()} variant="secondary">重试</Button></section>
      ) : datasets.data.items.length ? (
        <div className="dataset-grid">
          {datasets.data.items.map((dataset) => (
            <article className="dataset-card" key={dataset.id}>
              <div className="dataset-icon"><Database size={20} /></div>
              <div className="dataset-copy"><h2>{dataset.name}</h2><p>{dataset.description || '暂无说明'}</p><span>{dataset.documentCount ?? 0} 个文件</span></div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger aria-label={`${dataset.name} 操作`} className="icon-button"><MoreHorizontal size={18} /></DropdownMenu.Trigger>
                <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" sideOffset={5}>
                  <DropdownMenu.Item className="dropdown-item" onSelect={() => { setEditing(dataset); setDialogOpen(true); }}><Pencil size={15} />编辑</DropdownMenu.Item>
                  <DropdownMenu.Item className="dropdown-item dropdown-item--danger" onSelect={() => {
                    if (window.confirm(`删除资料集“${dataset.name}”？`)) remove.mutate(dataset.id);
                  }}><Trash2 size={15} />删除</DropdownMenu.Item>
                </DropdownMenu.Content></DropdownMenu.Portal>
              </DropdownMenu.Root>
            </article>
          ))}
        </div>
      ) : <EmptyState description="资料集用于限定问答和面试使用的资料范围。" title="还没有资料集" action={<Button onClick={openCreate}>新建资料集</Button>} />}
      {dialogOpen ? (
        <DatasetDialog
          dataset={editing}
          onOpenChange={setDialogOpen}
          onSubmit={async (value) => {
            await save.mutateAsync({ dataset: editing, value });
          }}
          open
        />
      ) : null}
    </section>
  );
}
