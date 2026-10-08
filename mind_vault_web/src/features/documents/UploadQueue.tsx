import { Ban, CircleCheck, EyeOff, LoaderCircle, RotateCcw, X } from 'lucide-react';
import type { QueuedUpload } from '../../stores/upload.store';

export function UploadQueue({
  cancel,
  items,
  retry,
  stopTracking,
}: {
  cancel: (localId: string) => void;
  items: QueuedUpload[];
  retry: (localId: string) => void;
  stopTracking: (localId: string) => void;
}) {
  if (!items.length) return null;

  return (
    <section aria-label="上传队列" className="upload-queue">
      <div className="section-heading"><h2>上传队列</h2><span>{items.length} 个文件</span></div>
      <ul>
        {items.map((item) => {
          const graph = item.graphProgress ?? null;
          const graphBuilding = graph?.status === 'PROCESSING';
          // 图谱在文档已可问答之后仍在后台构建，此时仍需要「停止跟踪」入口
          const tracking = item.status === 'processing' || (item.status === 'ready' && graphBuilding);
          const readyLabel =
            item.status !== 'ready'
              ? null
              : graphBuilding && graph
                ? `已可问答 · 正在构建知识图谱 ${graph.completed}/${graph.total}`
                : item.graphEnabled
                  ? '已可问答'
                  : '已可问答（未构建图谱）';

          return (
            <li key={item.localId}>
              <div className="upload-status-icon">
                {item.status === 'ready' ? <CircleCheck size={18} /> : item.status === 'failed' ? <Ban size={18} /> : <LoaderCircle size={18} />}
              </div>
              <div className="upload-copy">
                <strong>{item.file.name}</strong>
                <span>
                  {item.status === 'uploading' && '正在上传（服务端未提供进度）'}
                  {item.status === 'queued' && '等待上传'}
                  {item.status === 'processing' && `正在处理${item.currentStage ? `：${item.currentStage}` : ''}${item.stageProgress?.total ? ` · ${item.stageProgress.completed}/${item.stageProgress.total}` : ''}`}
                  {readyLabel}
                  {item.status === 'cancelled' && '已取消上传'}
                  {item.status === 'failed' && `失败${item.failedStage ? `于 ${item.failedStage}` : ''}${item.errorMessage ? `：${item.errorMessage}` : ''}`}
                </span>
                {item.status === 'uploading' ? <progress aria-label={`${item.file.name} 上传中`} /> : null}
                {item.status === 'processing' ? (
                  item.stageProgress?.total
                    ? <progress aria-label={`${item.file.name} 处理进度`} max="100" value={item.stageProgress.percent} />
                    : <progress aria-label={`${item.file.name} 处理中`} />
                ) : null}
                {item.status === 'ready' && graphBuilding && graph ? (
                  <progress
                    aria-label={`${item.file.name} 图谱构建进度`}
                    max="100"
                    value={graph.total > 0 ? Math.round((graph.completed / graph.total) * 100) : 0}
                  />
                ) : null}
              </div>
              {item.status === 'failed' ? (
                <button aria-label={`重试 ${item.file.name}`} className="icon-button" onClick={() => retry(item.localId)} type="button"><RotateCcw size={17} /></button>
              ) : tracking ? (
                <button
                  aria-label={`停止跟踪 ${item.file.name}`}
                  className="icon-button"
                  onClick={() => stopTracking(item.localId)}
                  title="仅从本地队列隐藏，不会取消服务端处理"
                  type="button"
                >
                  <EyeOff size={17} />
                </button>
              ) : ['queued', 'uploading'].includes(item.status) ? (
                <button aria-label={`取消 ${item.file.name}`} className="icon-button" onClick={() => cancel(item.localId)} type="button"><X size={17} /></button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
