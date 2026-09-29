import { useQuery } from '@tanstack/react-query';
import { Folder, Tags } from 'lucide-react';
import { listFolders, listTags } from '../../api/documents';
import { EmptyState, LoadingState, StatusBadge } from '../../components/ui';
import { LibraryNav } from '../../features/library/LibraryNav';
import { appConfig } from '../../lib/config';

type Kind = 'folders' | 'tags';

const copy = {
  folders: { title: '文件夹', Icon: Folder, description: '文件夹后端接口尚未提供。' },
  tags: { title: '标签', Icon: Tags, description: '标签后端接口尚未提供。' },
};

export function MockLibraryPage({ kind }: { kind: Kind }) {
  const config = copy[kind];
  const query = useQuery({
    queryKey: ['library-mock-adapter', kind],
    queryFn: async () => {
      if (kind === 'folders') return listFolders();
      return listTags();
    },
    retry: false,
  });

  return (
    <section className="page-section">
      <header className="page-heading"><div><p className="eyebrow">知识库</p><h1>{config.title}</h1></div><StatusBadge tone="warning">{appConfig.enableMockApi ? '模拟数据' : '暂不支持'}</StatusBadge></header>
      <LibraryNav />
      <div className="capability-notice" role="status"><config.Icon size={18} /><div><strong>{config.description}</strong><span>{appConfig.enableMockApi ? '当前内容来自前端 mock adapter，不代表真实服务数据。' : '启用 VITE_ENABLE_MOCK_API 可查看交互演示。'}</span></div></div>
      {query.isPending ? <LoadingState label={`加载${config.title}`} /> : query.data?.length ? (
        <div className="mock-list">{query.data.map((item) => <div key={item.id}><config.Icon size={18} /><span>{item.name}</span></div>)}</div>
      ) : <EmptyState description="此页面不会把未实现的服务能力伪装成真实数据。" title={`暂无${config.title}数据`} />}
    </section>
  );
}
