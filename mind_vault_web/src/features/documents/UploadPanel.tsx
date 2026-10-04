import type { ChangeEvent, DragEvent } from 'react';
import { useRef, useState } from 'react';
import { FileUp, FolderPlus, Upload } from 'lucide-react';
import type { Dataset } from '../../types/domain';
import { useUploadQueue } from '../../hooks/use-upload-queue';
import { Button } from '../../components/ui';
import { DatasetSelect } from '@/components/shadcn/DatasetSelect';
import { P0_EXTENSIONS } from './document-utils';

export function UploadPanel({
  datasets,
  onCreateDataset,
  onEnqueued,
}: {
  datasets: Dataset[];
  onCreateDataset: () => void;
  onEnqueued: (datasetId: string) => void;
}) {
  const { enqueue } = useUploadQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const [datasetId, setDatasetId] = useState('');
  const [dragging, setDragging] = useState(false);
  const selectedDatasetId = datasetId || datasets[0]?.id || '';

  function addFiles(files: FileList | File[]) {
    if (!selectedDatasetId) return;
    const nextFiles = Array.from(files);
    if (!nextFiles.length) return;
    enqueue(nextFiles, selectedDatasetId);
    onEnqueued(selectedDatasetId);
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

  if (!datasets.length) {
    return (
      <section className="upload-panel upload-panel--empty">
        <div className="upload-empty-state">
          <div className="upload-empty-state__icon"><FolderPlus size={28} /></div>
          <h3>先创建一个资料集</h3>
          <p>文件需要挂载在资料集下管理。创建资料集后即可上传文件。</p>
          <Button onClick={onCreateDataset}><FolderPlus size={16} />创建资料集</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-panel">
      <div className="upload-controls">
        <label htmlFor="upload-dataset">上传到资料集</label>
        <div className="upload-dataset-row">
          <DatasetSelect
            className="flex-1 min-w-0"
            datasets={datasets}
            id="upload-dataset"
            onChange={setDatasetId}
            value={selectedDatasetId}
          />
          <Button className="button--sm" onClick={onCreateDataset} variant="secondary"><FolderPlus size={14} />新建</Button>
        </div>
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
          aria-label="选择文件"
          accept={P0_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
          hidden
          multiple
          onChange={select}
          ref={inputRef}
          type="file"
        />
        <Button onClick={() => inputRef.current?.click()} type="button" variant="secondary">
          <Upload size={16} />选择文件
        </Button>
      </div>
    </section>
  );
}
