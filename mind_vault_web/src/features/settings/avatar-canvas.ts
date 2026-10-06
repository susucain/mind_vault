import {
  AVATAR_OUTPUT_QUALITY,
  AVATAR_VIEWPORT_SIZE,
  cropSourceRect,
} from './avatar';
import type { CropState, ImageSize } from './avatar';

export interface DecodedImage {
  source: CanvasImageSource;
  size: ImageSize;
}

/** 解码单独包一层：组件只依赖本模块，测试可整体 mock 掉浏览器解码能力 */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file);
  return { source: bitmap, size: { width: bitmap.width, height: bitmap.height } };
}

/**
 * 把裁剪视口内的可见区域绘制到目标画布。预览与导出共用同一份 `cropSourceRect` 映射，
 * 因此两者必然一致，也不会因浮点误差在边缘留下空白。
 */
export function drawCrop(
  target: HTMLCanvasElement,
  source: CanvasImageSource,
  image: ImageSize,
  crop: CropState,
  targetSize: number,
  viewport = AVATAR_VIEWPORT_SIZE,
): void {
  const context = target.getContext('2d');
  if (!context) return;
  const rect = cropSourceRect(crop, image, viewport);
  context.clearRect(0, 0, targetSize, targetSize);
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, targetSize, targetSize);
}

/**
 * 优先输出 WebP；浏览器不支持 WebP 编码时 toBlob 会回调 null，此时回落 JPEG。
 * 只以「回调是否拿到 blob」为判据，不依赖 caniuse 式的类型探测。
 */
export function canvasToBlob(canvas: HTMLCanvasElement, quality = AVATAR_OUTPUT_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      canvas.toBlob(
        (fallback) => (fallback ? resolve(fallback) : reject(new Error('图片编码失败，请更换图片重试'))),
        'image/jpeg',
        quality,
      );
    }, 'image/webp', quality);
  });
}