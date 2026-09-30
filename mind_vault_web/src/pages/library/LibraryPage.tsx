import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Archive, CheckSquare, Filter, Grid2X2, List, MoreHorizontal, Search, Upload } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { archiveDocument } from '../../api/documents';
import { Button, Drawer, EmptyState, Input, LoadingState, StatusBadge, Tooltip } from '../../components/ui';
import { LibraryNav } from '../../features/library/LibraryNav';
import { useDatasets, useDocuments } from '../../features/documents/queries';
import { documentStatus, documentStatusLabel, documentTone, fileType, formatDate, formatFileSize } from '../../features/documents/document-utils';
import { UploadPanel } from '../../features/documents/UploadPanel';
import { appConfig } from '../../lib/config';
import type { Document } from '../../types/domain';

type ViewMode = 'table' | 'list';
type SortMode = 'newest' | 'oldest' | 'name';

function Filters({
  dataset,
  datasets,
  onDataset,
  onStatus,
  onType,
  showMockFilters,
  status,
  type,
}: {
  dataset: string;
  datasets: Array<{ id: string; name: string }>;
  onDataset: (value: string) => void;
  onStatus: (value: string) => void;
  onType: (value: string) => void;
  showMockFilters: boolean;
  status: string;
  type: string;
}) {
  return (
    <div className="library-filters">
      {showMockFilters ? <><label>文件状态<select aria-label="文件状态" onChange={(event) => onStatus(event.target.value)} value={status}>
        <option value="">全部</option><option value="ready">可问答</option><option value="processing">处理中</option>
        <option value="failed">失败</option><option value="archived">已归档</option>
      </select></label>
      <label>文件类型<select aria-label="文件类型" onChange={(event) => onType(event.target.value)} value={type}>
        <option value="">全部</option>{['pdf', 'docx', 'pptx', 'xlsx', 'md', 'txt', 'csv', 'json'].map((item) => <option key={item}>{item}</option>)}
      </select></label></> : null}
      <label>资料集<select aria-label="资料集" onChange={(event) => onDataset(event.target.value)} value={dataset}>
        <option value="">全部</option>{datasets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    </div>
  );
}

function DocumentRows({ documents, selectable, selected, toggle, view }: {
  documents: Document[];
  selectable: boolean;
  selected: Set<string>;
  toggle: (id: string) => void;
  view: ViewMode;
}) {
  return (
    <div className={`document-results document-results--${view}`}>
      <div className="document-table-head" aria-hidden="true"><span /><span>文件</span><span>状态</span><span>大小</span><span>更新时间</span></div>
      {documents.map((document) => (
        <article className="document-row" key={document.id}>
          {selectable ? <input aria-label={`选择 ${document.title}`} checked={selected.has(document.id)} onChange={() => toggle(document.id)} type="checkbox" /> : <span />}
          <div className="document-name">
            <span className="file-extension">{fileType(document)}</span>
            <div><Link to={`/app/library/documents/${document.id}`}>{document.title}</Link><span>{document.sourceFileName || '已索引文档'}</span></div>
          </div>
          <StatusBadge tone={documentTone(document)}>{documentStatusLabel(document)}</StatusBadge>
          <span>{formatFileSize(document.sourceFileSize)}</span>
          <time>{formatDate(document.updatedAt || document.createdAt)}</time>
        </article>
      ))}
    </div>
  );
}

export function LibraryPage() {
  const mockMode = appConfig.enableMockApi;
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [dataset, setDataset] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [view, setView] = useState<ViewMode>('table');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(params.get('upload') === '1');
  const [selected, setSelected] = useState(new Set<string>());
  const [hidden, setHidden] = useState(new Set<string>());
  const [page, setPage] = useState(1);
  const [archiving, setArchiving] = useState(false);
  const pageSize = 10;
  const documents = useDocuments({
    title: mockMode ? undefined : search.trim() || undefined,
    datasetId: dataset || undefined,
    page: mockMode ? 1 : page,
    pageSize: mockMode ? 100 : pageSize,
  });
  const datasets = useDatasets();

  const filtered = useMemo(() => {
    const result = (documents.data?.items ?? []).filter((document) => !hidden.has(document.id)
      && (!mockMode || (
        document.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
        && (!status || documentStatus(document) === status)
        && (!type || fileType(document) === type)
      )));
    if (!mockMode) return result;
    return result.sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title, 'zh-CN');
      const difference = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      return sort === 'oldest' ? difference : -difference;
    });
  }, [documents.data?.items, hidden, mockMode, search, sort, status, type]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filterProps = {
    dataset,
    datasets: datasets.data?.items ?? [],
    onDataset: setDataset,
    onStatus: setStatus,
    onType: setType,
    showMockFilters: mockMode,
    status,
    type,
  };
  const totalPages = Math.max(1, Math.ceil((documents.data?.total ?? 0) / pageSize));

  async function archiveSelected() {
    const selectedDocuments = filtered.filter((document) => selected.has(document.id));
    setArchiving(true);
    try {
      await Promise.all(selectedDocuments.map((document) => archiveDocument(document.id, document)));
      setHidden((current) => new Set([...current, ...selectedDocuments.map((document) => document.id)]));
      setSelected(new Set());
    } finally {
      setArchiving(false);
    }
  }

  return (
    <section className="library-page page-section">
      <header className="page-heading">
        <div><p className="eyebrow">知识库</p><h1>全部文件</h1></div>
        <Button onClick={() => setUploadOpen((value) => !value)}><Upload size={17} />上传</Button>
      </header>
      <LibraryNav />
      {uploadOpen ? <UploadPanel datasets={datasets.data?.items ?? []} /> : null}
      <div className="library-toolbar">
        <div className="library-search"><Search aria-hidden="true" size={17} /><Input aria-label="搜索文件" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="搜索文件" role="searchbox" value={search} /></div>
        <div className="desktop-filters"><Filters {...filterProps} /></div>
        <Button className="mobile-filter-button" onClick={() => setFiltersOpen(true)} variant="secondary"><Filter size={16} />筛选</Button>
        {mockMode ? <label className="sort-control">排序<select aria-label="文件排序" onChange={(event) => setSort(event.target.value as SortMode)} value={sort}>
          <option value="newest">最近更新</option><option value="oldest">最早创建</option><option value="name">名称</option>
        </select></label> : <span className="sort-label">最近添加</span>}
        <div aria-label="视图方式" className="segmented-control">
          <Tooltip content="表格视图"><button aria-label="表格视图" aria-pressed={view === 'table'} onClick={() => setView('table')} type="button"><List size={17} /></button></Tooltip>
          <Tooltip content="列表视图"><button aria-label="列表视图" aria-pressed={view === 'list'} onClick={() => setView('list')} type="button"><Grid2X2 size={17} /></button></Tooltip>
        </div>
      </div>
      <Drawer onOpenChange={setFiltersOpen} open={filtersOpen} side="bottom" title="筛选文件"><Filters {...filterProps} /></Drawer>

      {mockMode && selected.size ? (
        <div className="batch-bar">
          <CheckSquare size={17} /><span>已选择 {selected.size} 项</span>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild><Button disabled={archiving} variant="secondary">批量操作<MoreHorizontal size={16} /></Button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" sideOffset={5}>
              <DropdownMenu.Item className="dropdown-item" onSelect={() => void archiveSelected()}><Archive size={15} />归档</DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      ) : null}

      {documents.isPending ? <LoadingState label="加载文件" /> : documents.isError ? (
        <section className="state-panel state-panel--error" role="alert"><h2>文件加载失败</h2><p>无法连接资料服务。</p><Button onClick={() => void documents.refetch()} variant="secondary">重试</Button></section>
      ) : filtered.length ? <DocumentRows documents={filtered} selectable={mockMode} selected={selected} toggle={toggle} view={view} /> : (
        <EmptyState
          description={search || status || type || dataset ? '调整搜索或筛选条件后重试。' : '上传资料后，可以在这里检索、整理和进入原文。'}
          title={search || status || type || dataset ? '没有匹配的文件' : '还没有文件'}
        />
      )}
      {!mockMode && documents.data && documents.data.total > pageSize ? (
        <nav aria-label="文件分页" className="pagination">
          <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} variant="secondary">上一页</Button>
          <span>第 {page} / {totalPages} 页</span>
          <Button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} variant="secondary">下一页</Button>
        </nav>
      ) : null}
    </section>
  );
}
