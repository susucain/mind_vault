import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { Button, Dialog } from '../../../components/ui';
import {
  AVATAR_MAX_SCALE,
  AVATAR_MIN_SCALE,
  AVATAR_OUTPUT_SIZE,
  AVATAR_VIEWPORT_SIZE,
  INITIAL_CROP_STATE,
  clampCrop,
  clampScale,
} from '../../../features/settings/avatar';
import type { CropState, ImageSize } from '../../../features/settings/avatar';
import { canvasToBlob, decodeImage, drawCrop } from '../../../features/settings/avatar-canvas';
import type { DecodedImage } from '../../../features/settings/avatar-canvas';

/** 方向键微调步长（视口像素） */
const KEY_STEP = 8;

/** 方形裁剪弹窗：预览与导出都走 drawCrop，所见即所得。 */
export function AvatarCropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [crop, setCrop] = useState<CropState>(INITIAL_CROP_STATE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    decodeImage(file)
      .then((decoded) => {
        if (!cancelled) setImage(decoded);
      })
      .catch(() => {
        if (!cancelled) setError('图片解码失败，请更换图片重试');
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    drawCrop(canvas, image.source, image.size, crop, AVATAR_VIEWPORT_SIZE);
  }, [crop, image]);

  const size: ImageSize | null = image?.size ?? null;

  function update(patch: Partial<CropState>) {
    if (!size) return;
    setCrop((current) => clampCrop({ ...current, ...patch }, size));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !size) return;
    // 画布坐标固定 320，窄屏下 CSS 尺寸会被压缩，位移必须按实际显示宽度换算
    const stage = event.currentTarget.getBoundingClientRect().width || AVATAR_VIEWPORT_SIZE;
    const ratio = AVATAR_VIEWPORT_SIZE / stage;
    const dx = (event.clientX - drag.x) * ratio;
    const dy = (event.clientY - drag.y) * ratio;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setCrop((current) =>
      clampCrop({ ...current, offsetX: current.offsetX + dx, offsetY: current.offsetY + dy }, size),
    );
  }

  function handlePointerEnd() {
    dragRef.current = null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleConfirm();
      return;
    }
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    update({ offsetX: crop.offsetX + step[0], offsetY: crop.offsetY + step[1] });
  }

  async function handleConfirm() {
    if (!canvasRef.current || !image || saving) return;
    setSaving(true);
    setError(null);
    try {
      const target = document.createElement('canvas');
      target.width = AVATAR_OUTPUT_SIZE;
      target.height = AVATAR_OUTPUT_SIZE;
      drawCrop(target, image.source, image.size, crop, AVATAR_OUTPUT_SIZE);
      onConfirm(await canvasToBlob(target));
    } catch (blobError) {
      setError(blobError instanceof Error ? blobError.message : '图片处理失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && !saving) onCancel();
      }}
      open
      title="裁剪头像"
    >
      <div className="avatar-crop">
        <div
          aria-label="裁剪区域，可拖动或用方向键微调"
          className="avatar-crop__stage"
          onKeyDown={handleKeyDown}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          role="application"
          tabIndex={0}
        >
          <canvas height={AVATAR_VIEWPORT_SIZE} ref={canvasRef} width={AVATAR_VIEWPORT_SIZE} />
          <div aria-hidden="true" className="avatar-crop__guide" />
        </div>
        <div className="avatar-crop__controls">
          <label className="sr-only" htmlFor="avatar-crop-zoom">缩放</label>
          <input
            disabled={!image}
            id="avatar-crop-zoom"
            max={AVATAR_MAX_SCALE}
            min={AVATAR_MIN_SCALE}
            onChange={(event) => update({ scale: clampScale(Number(event.target.value)) })}
            step={0.01}
            type="range"
            value={crop.scale}
          />
          <Button disabled={!image} onClick={() => setCrop(INITIAL_CROP_STATE)} type="button" variant="secondary">
            <RotateCcw size={15} />重置
          </Button>
        </div>
        <p className="field-hint">拖动调整位置，滑杆缩放。头像按 1:1 裁切、圆形展示。</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <Button disabled={saving} onClick={onCancel} type="button" variant="secondary">取消</Button>
          <Button disabled={!image || saving} onClick={() => void handleConfirm()} type="button">
            {saving ? <LoaderCircle className="spin-icon" size={15} /> : null}确认
          </Button>
        </div>
      </div>
    </Dialog>
  );
}