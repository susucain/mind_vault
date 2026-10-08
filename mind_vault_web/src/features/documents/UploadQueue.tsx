import { Ban, CircleCheck, EyeOff, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { canCancelUpload, type QueuedUpload } from '../../stores/upload.store';

/**
 * 解析失败错误码 → 定向降级文案（A2）。后端 `error_message` 已可读，
 * 这里按码覆盖是为了让「扫描件/老格式」等原因在不同入口保持同一措辞。
 */
const FAILURE_LABELS: Record<string, string> = {
  PARSE_EMPTY: '文件解析结果为空，请确认包含可提取的文本',
  PARSE_SUSPECTED_SCANNED: '疑似扫描件，暂不支持文字提取',
  PARSE_LEGACY_UNAVAILABLE: '旧版 Office 格式需服务端安装 LibreOffice',
  PARSE_FAILED: '解析失败，可稍后重试',
};

/** 优先用错误码定向文案，缺失时回落到服务端原文 */
function failureLabel(errorCode?: string, errorMessage?: string): string | undefined {
  return (errorCode && FAILURE_LABELS[errorCode]) || errorMessage;
}

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
          // U8 档 1：只有尚未被 worker 接手的任务可取消，进入处理后按钮置灰并说明原因
          const cancelable = canCancelUpload(item);
          const cancelLocked = item.status === 'processing' && !cancelable;
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
                  {item.status === 'uploading' && `正在上传 ${item.progress}%`}
                  {item.status === 'queued' && '排队中'}
                  {item.status === 'processing' && `正在处理${item.currentStage ? `：${item.currentStage}` : ''}${item.stageProgress?.total ? ` · ${item.stageProgress.completed}/${item.stageProgress.total}` : ''}`}
                  {readyLabel}
                  {item.status === 'cancelled' && '已取消上传'}
                  {item.status === 'failed' &&
                    (item.duplicateOf
                      ? `该文件已存在：${item.duplicateOf.name}`
                      : `失败${item.failedStage ? `于 ${item.failedStage}` : ''}${failureLabel(item.errorCode, item.errorMessage) ? `：${failureLabel(item.errorCode, item.errorMessage)}` : ''}`)}
                </span>
                {item.status === 'uploading' ? (
                  <progress aria-label={`${item.file.name} 上传中`} max="100" value={item.progress} />
                ) : null}
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
              ) : (
                <>
                  {cancelable ? (
                    <button aria-label={`取消 ${item.file.name}`} className="icon-button" onClick={() => cancel(item.localId)} type="button"><X size={17} /></button>
                  ) : cancelLocked ? (
                    <button
                      aria-label={`取消 ${item.file.name}`}
                      className="icon-button"
                      disabled
                      title="已进入处理，无法取消"
                      type="button"
                    >
                      <X size={17} />
                    </button>
                  ) : null}
                  {tracking ? (
                    <button
                      aria-label={`停止跟踪 ${item.file.name}`}
                      className="icon-button"
                      onClick={() => stopTracking(item.localId)}
                      title="仅从本地队列隐藏，不会取消服务端处理"
                      type="button"
                    >
                      <EyeOff size={17} />
                    </button>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
