import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderPlus, Grid2X2, List, Plus, Search, Upload, FolderOpen, Inbox } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { createDataset } from '../../api/datasets';
import { buildDocumentGraph } from '../../api/documents';
import { Button, Dialog, EmptyState, Input, LoadingState, Tooltip } from '../../components/ui';
import { useDatasets, useDocuments } from '../../features/documents/queries';
import { documentStatus, fileType, formatDate, formatFileSize } from '../../features/documents/document-utils';
import { DocumentGraphBadge } from '../../features/documents/DocumentGraphBadge';
import { DocumentStatusIndicator } from '../../features/documents/DocumentStatusIndicator';
import { UploadPanel } from '../../features/documents/UploadPanel';
import { DatasetDialog } from '../../features/datasets/DatasetDialog';
import { useUploadStore, type QueuedUpload } from '../../stores/upload.store';
import type { DatasetFormValue } from '../../features/datasets/dataset-schema';
import type { Document } from '../../types/domain';

type ViewMode = 'table' | 'list';

function DatasetSidebar({
  activeId,
  datasets,
  onSelect,
  onCreate,
}: {
  activeId: string;
  datasets: Array<{ id: string; name: string }>;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="dataset-sidebar">
      <div className="dataset-sidebar__header">
        <span>资料集</span>
        <button aria-label="新建资料集" className="icon-button" onClick={onCreate} type="button">
          <Plus size={16} />
        </button>
      </div>
      <div className="dataset-sidebar__list">
        <button
          className={`dataset-item ${activeId === '' ? 'dataset-item--active' : ''}`}
          onClick={() => onSelect('')}
          type="button"
        >
          <FolderOpen size={16} />
          <span>全部文件</span>
        </button>
        {datasets.map((dataset) => (
          <button
            className={`dataset-item ${activeId === dataset.id ? 'dataset-item--active' : ''}`}
            key={dataset.id}
            onClick={() => onSelect(dataset.id)}
            type="button"
          >
            <FolderOpen size={16} />
            <span className="dataset-item__name">{dataset.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function queuedUploadToDocument(item: QueuedUpload, datasetName?: string): Document {
  const extension = item.file.name.split('.').pop()?.toLowerCase() || 'file';
  return {
    id: `local:${item.localId}`,
    title: item.file.name,
    status: item.status === 'queued' || item.status === 'cancelled' ? 'pending' : item.status,
    sourceFileName: item.file.name,
    sourceFileSize: String(item.file.size),
    sourceFileExtension: extension,
    datasetId: item.datasetId,
    datasetName,
  };
}

function DocumentRows({
  buildingId,
  documents,
  highlightedIds,
  onBuildGraph,
  view,
}: {
  buildingId: string | null;
  documents: Document[];
  /** 被上传队列判定为重复的既有文档 id（U3）：高亮提示「该文件已存在」 */
  highlightedIds: Set<string>;
  onBuildGraph: (documentId: string) => void;
  view: ViewMode;
}) {
  return (
    <div className={`document-results document-results--${view}`}>
      <div className="document-table-head" aria-hidden="true">
        <span />
        <span>文件</span>
        <span>资料集</span>
        <span>状态</span>
        <span>大小</span>
        <span>更新时间</span>
      </div>
      {documents.map((document) => (
        <article
          className={`document-row${highlightedIds.has(document.id) ? ' document-row--duplicate' : ''}`}
          key={document.id}
        >
          <span />
          <div className="document-name">
            <span className="file-extension">{fileType(document)}</span>
            <div>
              {document.id.startsWith('local:') ? (
                <strong>{document.title}</strong>
              ) : (
                <Link to={`/app/library/documents/${document.id}`}>{document.title}</Link>
              )}
              <span>{document.sourceFileName || '已索引文档'}</span>
            </div>
          </div>
          <span className="document-dataset">
            {document.datasetName ? (
              <span className="dataset-tag">{document.datasetName}</span>
            ) : (
              <span className="dataset-tag dataset-tag--muted">未归类</span>
            )}
          </span>
          <div className="document-status-cell">
            <DocumentStatusIndicator status={documentStatus(document)} />
            <DocumentGraphBadge
              building={buildingId === document.id}
              document={document}
              onBuild={onBuildGraph}
            />
          </div>
          <span>{formatFileSize(document.sourceFileSize)}</span>
          <time>{formatDate(document.updatedAt || document.createdAt)}</time>
        </article>
      ))}
    </div>
  );
}

export function LibraryPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [uploadOpen, setUploadOpen] = useState(params.get('upload') === '1');
  const [page, setPage] = useState(1);
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
  const uploadItems = useUploadStore((state) => state.items);
  const queryClient = useQueryClient();
  const readyUploadIds = useRef(new Set<string>());
  const pageSize = 10;

  const documents = useDocuments({
    title: search.trim() || undefined,
    datasetId: datasetId || undefined,
    page,
    pageSize,
  });
  const datasets = useDatasets();
  useEffect(() => {
    for (const item of uploadItems) {
      if (item.status === 'ready' && !readyUploadIds.current.has(item.localId)) {
        readyUploadIds.current.add(item.localId);
        void queryClient.invalidateQueries({ queryKey: ['documents'] });
        void queryClient.invalidateQueries({ queryKey: ['overview'] });
      }
    }
  }, [queryClient, uploadItems]);
  const createDatasetMutation = useMutation({
    mutationFn: (value: DatasetFormValue) => createDataset(value),
    onSuccess: () => {
      void datasets.refetch();
      setDatasetDialogOpen(false);
    },
  });
  // 补建图谱：只对已有分块的文档入队，成功后刷新列表拿回最新图谱进度
  const buildGraphMutation = useMutation({
    mutationFn: (documentId: string) => buildDocumentGraph(documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const filtered = useMemo(() => {
    const serverDocuments = documents.data?.items ?? [];
    const serverIds = new Set(serverDocuments.map((document) => document.id));
    const localDocuments = uploadItems
      .filter((item) => !item.documentId || !serverIds.has(item.documentId))
      .filter((item) => !datasetId || item.datasetId === datasetId)
      .filter((item) => !search.trim() || item.file.name.toLowerCase().includes(search.trim().toLowerCase()))
      .map((item) => queuedUploadToDocument(
        item,
        datasets.data?.items?.find((dataset) => dataset.id === item.datasetId)?.name,
      ));
    return [...localDocuments, ...serverDocuments];
  }, [datasetId, datasets.data?.items, documents.data?.items, search, uploadItems]);
  const totalPages = Math.max(1, Math.ceil((documents.data?.total ?? 0) / pageSize));
  // 上传队列中命中 409 的既有文档 id（U3）：在列表里高亮，配合队列中的「该文件已存在」提示
  const duplicateIds = useMemo(
    () =>
      new Set(
        uploadItems
          .map((item) => item.duplicateOf?.id)
          .filter((value): value is string => Boolean(value)),
      ),
    [uploadItems],
  );
  const hasDatasets = (datasets.data?.items?.length ?? 0) > 0;
  const hasDocuments = filtered.length > 0;
  const isEmpty = !documents.isPending && !hasDocuments;
  const activeDatasetName = datasetId
    ? datasets.data?.items?.find((d) => d.id === datasetId)?.name ?? '资料集'
    : '全部文件';

  return (
    <section className="library-page library-page--split">
      <DatasetSidebar
        activeId={datasetId}
        datasets={datasets.data?.items ?? []}
        onCreate={() => setDatasetDialogOpen(true)}
        onSelect={(id) => { setDatasetId(id); setPage(1); }}
      />

      <div className="library-main">
        <header className="page-heading">
          <div>
            <p className="eyebrow">知识库</p>
            <h1>{activeDatasetName}</h1>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload size={17} />上传
          </Button>
        </header>

        <div className="library-toolbar">
          <div className="library-search">
            <Search aria-hidden="true" size={17} />
            <Input
              aria-label="搜索文件"
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="搜索文件"
              role="searchbox"
              value={search}
            />
          </div>
          <span className="sort-label">最近添加</span>
          <div aria-label="视图方式" className="segmented-control">
            <Tooltip content="表格视图">
              <button aria-label="表格视图" aria-pressed={view === 'table'} onClick={() => setView('table')} type="button">
                <List size={17} />
              </button>
            </Tooltip>
            <Tooltip content="列表视图">
              <button aria-label="列表视图" aria-pressed={view === 'list'} onClick={() => setView('list')} type="button">
                <Grid2X2 size={17} />
              </button>
            </Tooltip>
          </div>
        </div>

        {documents.isPending ? (
          <LoadingState label="加载文件" />
        ) : documents.isError ? (
          <section className="state-panel state-panel--error" role="alert">
            <h2>文件加载失败</h2>
            <p>无法连接资料服务。</p>
            <Button onClick={() => void documents.refetch()} variant="secondary">重试</Button>
          </section>
        ) : hasDocuments ? (
          <>
            {buildGraphMutation.isError ? (
              <p className="library-notice" role="alert">
                补建图谱失败：{buildGraphMutation.error instanceof Error ? buildGraphMutation.error.message : '请稍后重试'}
              </p>
            ) : buildGraphMutation.data?.reindexQueued ? (
              <p className="library-notice" role="status">
                该文档缺少分块检查点，已自动改为重建索引，重建完成后会自动构建图谱。
              </p>
            ) : null}
            <DocumentRows
              buildingId={buildGraphMutation.isPending ? buildGraphMutation.variables ?? null : null}
              documents={filtered}
              highlightedIds={duplicateIds}
              onBuildGraph={(documentId) => buildGraphMutation.mutate(documentId)}
              view={view}
            />
          </>
        ) : isEmpty && !hasDatasets ? (
          <div className="onboarding-card">
            <div className="onboarding-card__icon"><Inbox size={28} /></div>
            <h2>欢迎来到知识库</h2>
            <p>文件是挂载在「资料集」下的。先创建一个资料集，再上传你的第一份资料吧。</p>
            <div className="onboarding-card__actions">
              <Button onClick={() => setDatasetDialogOpen(true)}>
                <FolderPlus size={17} />创建资料集
              </Button>
            </div>
          </div>
        ) : isEmpty ? (
          <EmptyState
            description={search || datasetId ? '调整搜索或筛选条件后重试。' : '这个资料集还没有文件，点击右上角上传按钮开始添加。'}
            title={search || datasetId ? '没有匹配的文件' : '还没有文件'}
          />
        ) : null}

        {documents.data && documents.data.total > pageSize ? (
          <nav aria-label="文件分页" className="pagination">
            <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} variant="secondary">上一页</Button>
            <span>第 {page} / {totalPages} 页</span>
            <Button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} variant="secondary">下一页</Button>
          </nav>
        ) : null}
      </div>

      <Dialog className="upload-dialog" onOpenChange={setUploadOpen} open={uploadOpen} title="上传文件">
        <div className="upload-dialog__body">
          <UploadPanel
            datasets={datasets.data?.items ?? []}
            onCreateDataset={() => setDatasetDialogOpen(true)}
            onEnqueued={() => {
              setUploadOpen(false);
              setDatasetId('');
              setSearch('');
              setPage(1);
            }}
          />
          <p className="upload-dialog__hint">上传后窗口会自动关闭，文件处理状态将在「全部文件」表格中更新。</p>
        </div>
      </Dialog>

      <DatasetDialog
        onOpenChange={setDatasetDialogOpen}
        onSubmit={async (value) => { await createDatasetMutation.mutateAsync(value); }}
        open={datasetDialogOpen}
      />
    </section>
  );
}
