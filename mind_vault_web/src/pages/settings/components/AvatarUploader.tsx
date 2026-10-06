import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, Trash } from 'lucide-react';
import { Button, Dialog } from '../../../components/ui';
import type { Profile } from '../../../api/profile';
import { AVATAR_ALLOWED_TYPES, fallbackColor, initialOf, validateAvatarFile } from '../../../features/settings/avatar';
import { describeProfileError } from '../../../features/settings/settings-labels';
import { useAvatarUrl, useRemoveAvatar, useUploadAvatar } from '../../../features/settings/queries';
import { AvatarCropDialog } from './AvatarCropDialog';

export function AvatarUploader({ profile }: { profile: Profile }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const storedUrl = useAvatarUrl(profile.avatarKey);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const disabled = profile.isDevAccount;
  const busy = upload.isPending || remove.isPending;
  const imageUrl = previewUrl ?? storedUrl;

  // 乐观预览的 object URL 只在卸载时释放：立刻 revoke 会让 `<img>` 在新地址生效前先断图
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function selectFile(file: File | undefined) {
    setFeedback(null);
    if (!file) return;
    const invalid = validateAvatarFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setPendingFile(file);
  }

  async function confirmCrop(blob: Blob) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(blob);
    previewRef.current = url;
    setPreviewUrl(url);
    setPendingFile(null);

    const extension = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
    try {
      await upload.mutateAsync(new File([blob], `avatar.${extension}`, { type: blob.type || 'image/webp' }));
      setError(null);
      setFeedback('头像已更新');
    } catch (uploadError) {
      setError(describeProfileError(uploadError));
    } finally {
      // 成功时切回服务端头像，失败时回落到原头像
      setPreviewUrl(null);
    }
  }

  async function confirmRemove() {
    setRemoving(false);
    setFeedback(null);
    try {
      await remove.mutateAsync();
      setError(null);
      setFeedback('头像已移除');
    } catch (removeError) {
      setError(describeProfileError(removeError));
    }
  }

  return (
    <div className="avatar-block">
      {imageUrl ? (
        <img alt={`${profile.nickname} 的头像`} className="avatar-preview" src={imageUrl} />
      ) : (
        <span
          aria-hidden="true"
          className="avatar-initial"
          style={{ backgroundColor: fallbackColor(profile.id) }}
        >
          {initialOf(profile.nickname)}
        </span>
      )}

      <div className="avatar-block__copy">
        <div className="avatar-block__actions">
          <Button
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            type="button"
            variant="secondary"
          >
            {busy ? <LoaderCircle className="spin-icon" size={15} /> : <Camera size={15} />}更换头像
          </Button>
          {profile.avatarKey ? (
            <Button disabled={disabled || busy} onClick={() => setRemoving(true)} type="button" variant="ghost">
              <Trash size={15} />移除
            </Button>
          ) : null}
        </div>
        <p className="field-hint">
          {disabled ? '开发账号不支持修改头像。' : '支持 PNG / JPEG / WebP，上传后按 1:1 裁剪。'}
        </p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {feedback ? <p className="settings-feedback" role="status">{feedback}</p> : null}
      </div>

      <input
        accept={AVATAR_ALLOWED_TYPES.join(',')}
        aria-label="选择头像文件"
        className="sr-only"
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          // 清空 value，否则连续选择同一文件不会触发 change
          event.target.value = '';
        }}
        ref={inputRef}
        type="file"
      />

      {pendingFile ? (
        <AvatarCropDialog
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={(blob) => void confirmCrop(blob)}
        />
      ) : null}

      <Dialog onOpenChange={setRemoving} open={removing} title="移除头像">
        <p className="muted">移除后将回到默认头像，此操作不可撤销。</p>
        <div className="dialog-actions">
          <Button onClick={() => setRemoving(false)} type="button" variant="secondary">取消</Button>
          <Button onClick={() => void confirmRemove()} type="button">确认移除</Button>
        </div>
      </Dialog>
    </div>
  );
}