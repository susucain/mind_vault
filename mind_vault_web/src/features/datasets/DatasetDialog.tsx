import type { FormEvent } from 'react';
import { useState } from 'react';
import type { Dataset } from '../../types/domain';
import { Button, Dialog, Input } from '../../components/ui';
import { datasetSchema, type DatasetFormValue } from './dataset-schema';

export function DatasetDialog({
  dataset,
  onOpenChange,
  onSubmit,
  open,
}: {
  dataset?: Dataset;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: DatasetFormValue) => Promise<void>;
  open: boolean;
}) {
  const [name, setName] = useState(dataset?.name ?? '');
  const [description, setDescription] = useState(dataset?.description ?? '');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = datasetSchema.safeParse({ name, description });
    if (!result.success) {
      setError(result.error.issues[0]?.message);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSubmit(result.data);
      onOpenChange(false);
    } catch {
      setError('保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open} title={dataset ? '编辑资料集' : '新建资料集'}>
      <form className="dialog-form" onSubmit={submit}>
        <label htmlFor="dataset-name">名称</label>
        <Input id="dataset-name" onChange={(event) => setName(event.target.value)} value={name} />
        <label htmlFor="dataset-description">说明</label>
        <textarea id="dataset-description" onChange={(event) => setDescription(event.target.value)} rows={4} value={description} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <Button onClick={() => onOpenChange(false)} type="button" variant="secondary">取消</Button>
          <Button disabled={saving} type="submit">{saving ? '保存中' : '保存'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
