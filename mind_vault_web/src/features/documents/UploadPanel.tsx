import type { ChangeEvent, DragEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp, Upload } from 'lucide-react';
import type { Dataset } from '../../types/domain';
import { useUploadQueue } from '../../hooks/use-upload-queue';
import { Button } from '../../components/ui';
import { P0_EXTENSIONS } from './document-utils';
import { UploadQueue } from './UploadQueue';

export function UploadPanel({ datasets }: { datasets: Dataset[] }) {
  const queryClient = useQueryClient();
  const { cancel, enqueue, items, retry } = useUploadQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const readyIds = useRef(new Set<string>());
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? '');
  const [dragging, setDragging] = useState(false);
  const selectedDatasetId = datasetId || datasets[0]?.id || '';

  useEffect(() => {
    for (const item of items) {
      if (item.status === 'ready' && !readyIds.current.has(item.localId)) {
        readyIds.current.add(item.localId);
        void queryClient.invalidateQueries({ queryKey: ['documents'] });
        void queryClient.invalidateQueries({ queryKey: ['overview'] });
      }
    }
  }, [items, queryClient]);

  function addFiles(files: FileList | File[]) {
    if (!selectedDatasetId) return;
    enqueue(Array.from(files), selectedDatasetId);
  }

  function select(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = '';
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <section className="upload-panel">
      <div className="upload-controls">
        <label htmlFor="upload-dataset">上传到资料集</label>
        <select id="upload-dataset" onChange={(event) => setDatasetId(event.target.value)} value={selectedDatasetId}>
          {!datasets.length ? <option value="">请先创建资料集</option> : null}
          {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
        </select>
      </div>
      <div
        className="drop-zone"
        data-dragging={dragging}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        <FileUp aria-hidden="true" size={24} />
        <div><strong>拖放文件到这里</strong><span>支持 {P0_EXTENSIONS.join('、')}，单文件不超过 100MB</span></div>
        <input
          accept={P0_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
          hidden
          multiple
          onChange={select}
          ref={inputRef}
          type="file"
        />
        <Button disabled={!selectedDatasetId} onClick={() => inputRef.current?.click()} type="button" variant="secondary">
          <Upload size={16} />选择文件
        </Button>
      </div>
      <UploadQueue cancel={cancel} items={items} retry={retry} />
    </section>
  );
}
