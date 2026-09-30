import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, FileText } from 'lucide-react';
import { listArchivedDocuments, restoreArchivedDocument } from '../../api/documents';
import { Button, EmptyState, LoadingState, StatusBadge } from '../../components/ui';
import { LibraryNav } from '../../features/library/LibraryNav';
import { appConfig } from '../../lib/config';

export function ArchivePage() {
  const [error, setError] = useState<string>();
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled: appConfig.enableMockApi,
    queryKey: ['library-mock-adapter', 'archive'],
    queryFn: listArchivedDocuments,
    retry: false,
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreArchivedDocument(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library-mock-adapter', 'archive'] }),
    onError: () => setError('恢复失败，请稍后重试。'),
  });

  function restoreItem(id: string) {
    setError(undefined);
    restore.mutate(id);
  }

  return (
    <section className="page-section">
      <header className="page-heading">
        <div><p className="eyebrow">知识库</p><h1>归档</h1></div>
        <StatusBadge tone="warning">{appConfig.enableMockApi ? '模拟数据' : '暂不支持'}</StatusBadge>
      </header>
      <LibraryNav />
      <div className="capability-notice" role="status">
        <ArchiveRestore size={18} />
        <div>
          <strong>归档与恢复后端接口尚未提供。</strong>
          <span>{appConfig.enableMockApi ? '当前操作通过前端 mock adapter 演示，不会修改真实服务数据。' : '启用 VITE_ENABLE_MOCK_API 可查看恢复流程。'}</span>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!appConfig.enableMockApi ? (
        <EmptyState description="归档服务尚未提供，归档与恢复操作已禁用。" title="暂不支持归档" />
      ) : query.isPending ? <LoadingState label="加载归档" /> : query.data?.length ? (
        <div className="archive-list">
          {query.data.map((item) => (
            <article key={item.id}>
              <FileText size={18} />
              <div><strong>{item.title}</strong><span>{item.sourceFileExtension?.toUpperCase() || 'FILE'} · 归档于 {item.archivedAt}</span></div>
              <Button
                aria-label={`恢复 ${item.title}`}
                disabled={restore.isPending && restore.variables === item.id}
                onClick={() => restoreItem(item.id)}
                variant="secondary"
              >
                <ArchiveRestore size={16} />{restore.isPending && restore.variables === item.id ? '恢复中' : '恢复'}
              </Button>
            </article>
          ))}
        </div>
      ) : <EmptyState description="归档的模拟文件会显示在这里。" title="归档中没有文件" />}
    </section>
  );
}
