import { useState } from 'react';
import { ArchiveRestore, FileText } from 'lucide-react';
import { restoreArchivedDocument } from '../../api/documents';
import { Button, EmptyState, StatusBadge } from '../../components/ui';
import { LibraryNav } from '../../features/library/LibraryNav';
import { appConfig } from '../../lib/config';

const initialMockItems = [{ id: 'mock-archived-1', title: '历史项目总结', type: 'pdf', archivedAt: '2026-09-18' }];

export function ArchivePage() {
  const [items, setItems] = useState(appConfig.enableMockApi ? initialMockItems : []);
  const [restoring, setRestoring] = useState<string>();
  const [error, setError] = useState<string>();

  async function restore(id: string) {
    setRestoring(id);
    setError(undefined);
    try {
      await restoreArchivedDocument(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch {
      setError('恢复失败，请稍后重试。');
    } finally {
      setRestoring(undefined);
    }
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
      {items.length ? (
        <div className="archive-list">
          {items.map((item) => (
            <article key={item.id}>
              <FileText size={18} />
              <div><strong>{item.title}</strong><span>{item.type.toUpperCase()} · 归档于 {item.archivedAt}</span></div>
              <Button
                aria-label={`恢复 ${item.title}`}
                disabled={restoring === item.id}
                onClick={() => void restore(item.id)}
                variant="secondary"
              >
                <ArchiveRestore size={16} />{restoring === item.id ? '恢复中' : '恢复'}
              </Button>
            </article>
          ))}
        </div>
      ) : <EmptyState description="归档文件可在后端能力上线后从这里恢复。" title="归档中没有文件" />}
    </section>
  );
}
