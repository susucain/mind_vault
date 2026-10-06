/** 头像处理的纯函数：文件预校验与方形裁剪数学。canvas 绘制留在组件里，这里只做可单测的计算。 */

export const AVATAR_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** 客户端预校验上限，取原图而非裁剪结果；服务端另有 2MB 兜底 */
export const AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** 裁剪视口的 CSS 尺寸（正方形） */
export const AVATAR_VIEWPORT_SIZE = 320;
/** 输出尺寸：512×512 在列表与顶栏都够清晰，又不至于超过 100KB */
export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_OUTPUT_QUALITY = 0.9;
export const AVATAR_MIN_SCALE = 1;
export const AVATAR_MAX_SCALE = 3;

/** 默认头像底色：取自既有色板，按 id 取模固定，同一用户始终同色（不用随机） */
export const FALLBACK_COLORS = ['#2d6b5c', '#c47a2b', '#3a8a63', '#5f5c52', '#a13030', '#255a4d'];

export interface ImageSize {
  width: number;
  height: number;
}

export interface CropState {
  /** 相对“恰好铺满视口”的倍率，1 表示不额外放大 */
  scale: number;
  /** 图片中心相对视口中心的位移，单位为视口像素 */
  offsetX: number;
  offsetY: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const INITIAL_CROP_STATE: CropState = { scale: 1, offsetX: 0, offsetY: 0 };

/** 返回用户可读的错误文案，通过则返回 null */
export function validateAvatarFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
    return '仅支持 PNG / JPEG / WebP 图片';
  }
  if (file.size <= 0) {
    return '图片内容为空，请重新选择';
  }
  if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
    return `图片不能超过 ${AVATAR_MAX_UPLOAD_BYTES / 1024 / 1024}MB`;
  }
  return null;
}

/** 以 cover 方式铺满视口所需的基准倍率（长宽比不同时，长边会溢出） */
export function coverScale(image: ImageSize, viewport = AVATAR_VIEWPORT_SIZE): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.max(viewport / image.width, viewport / image.height);
}

/** 图片被拖出视口会在边缘留下空白，因此位移必须钳在“溢出的一半”以内 */
export function clampOffset(offset: number, contentSize: number, viewport: number): number {
  const limit = Math.max(0, (contentSize - viewport) / 2);
  return Math.min(limit, Math.max(-limit, offset));
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return AVATAR_MIN_SCALE;
  return Math.min(AVATAR_MAX_SCALE, Math.max(AVATAR_MIN_SCALE, scale));
}

/** 渲染尺寸 = 原图尺寸 × coverScale × scale */
export function renderedSize(image: ImageSize, scale: number, viewport = AVATAR_VIEWPORT_SIZE): ImageSize {
  const factor = coverScale(image, viewport) * clampScale(scale);
  return { width: image.width * factor, height: image.height * factor };
}

/** 把一组裁剪参数收敛到合法范围：缩放钳在 1-3，位移钳在溢出范围内 */
export function clampCrop(state: CropState, image: ImageSize, viewport = AVATAR_VIEWPORT_SIZE): CropState {
  const scale = clampScale(state.scale);
  const content = renderedSize(image, scale, viewport);
  return {
    scale,
    offsetX: clampOffset(state.offsetX, content.width, viewport),
    offsetY: clampOffset(state.offsetY, content.height, viewport),
  };
}

/**
 * 视口可见区域映射回原图像素坐标，供离屏 canvas 按此矩形绘制到 512×512。
 * 结果再钳一次图片边界，避免浮点误差画出 1px 空白边。
 */
export function cropSourceRect(
  state: CropState,
  image: ImageSize,
  viewport = AVATAR_VIEWPORT_SIZE,
): CropRect {
  const safe = clampCrop(state, image, viewport);
  const factor = coverScale(image, viewport) * safe.scale;
  const content = renderedSize(image, safe.scale, viewport);

  const width = Math.min(image.width, viewport / factor);
  const height = Math.min(image.height, viewport / factor);
  // 视口左上角对应的原图坐标：图片右移（offsetX > 0）会看到更靠左的区域
  const x = Math.min(
    Math.max(0, (content.width / 2 - viewport / 2 - safe.offsetX) / factor),
    image.width - width,
  );
  const y = Math.min(
    Math.max(0, (content.height / 2 - viewport / 2 - safe.offsetY) / factor),
    image.height - height,
  );

  return { x, y, width, height };
}

/** 无头像时的首字母：取昵称首字符并大写，昵称缺失时用 `?` 兜底 */
export function initialOf(nickname: string): string {
  const trimmed = nickname.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}

/** 由用户 id 派生的稳定底色，保证同一用户在任何位置的头像颜色一致 */
export function fallbackColor(id: string): string {
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) sum = (sum + id.charCodeAt(index)) % 997;
  return FALLBACK_COLORS[sum % FALLBACK_COLORS.length];
}