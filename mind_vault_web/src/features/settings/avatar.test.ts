import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_UPLOAD_BYTES,
  AVATAR_VIEWPORT_SIZE,
  clampCrop,
  clampOffset,
  coverScale,
  cropSourceRect,
  renderedSize,
  validateAvatarFile,
} from './avatar';

const square = { width: 1024, height: 1024 };
const landscape = { width: 1280, height: 720 };

describe('validateAvatarFile', () => {
  it('accepts the three server-side allowed types', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/webp', size: 1024 })).toBeNull();
  });

  it('rejects unsupported types before opening the cropper', () => {
    expect(validateAvatarFile({ type: 'image/gif', size: 1024 })).toBe('仅支持 PNG / JPEG / WebP 图片');
  });

  it('rejects empty and oversized files', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 0 })).toBe('图片内容为空，请重新选择');
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_UPLOAD_BYTES + 1 })).toContain('5MB');
    expect(validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_UPLOAD_BYTES })).toBeNull();
  });
});

describe('coverScale / renderedSize', () => {
  it('scales so the shorter side fills the viewport', () => {
    expect(coverScale(square)).toBeCloseTo(AVATAR_VIEWPORT_SIZE / 1024);
    expect(coverScale(landscape)).toBeCloseTo(AVATAR_VIEWPORT_SIZE / 720);
  });

  it('multiplies the cover scale by the user scale', () => {
    const expected = landscape.width * (AVATAR_VIEWPORT_SIZE / 720) * 2;
    expect(renderedSize(landscape, 2).width).toBeCloseTo(expected);
  });

  it('never divides by zero on a broken image', () => {
    expect(coverScale({ width: 0, height: 0 })).toBe(1);
  });
});

describe('clampOffset / clampCrop', () => {
  it('clamps translation to half of the overflow, and to zero when there is none', () => {
    expect(clampOffset(999, 400, AVATAR_VIEWPORT_SIZE)).toBe(40);
    expect(clampOffset(-999, 400, AVATAR_VIEWPORT_SIZE)).toBe(-40);
    expect(clampOffset(999, 300, AVATAR_VIEWPORT_SIZE)).toBe(0);
  });

  it('clamps scale into range and re-clamps offsets against the clamped scale', () => {
    const clamped = clampCrop({ scale: 9, offsetX: 9999, offsetY: -9999 }, landscape);
    const content = renderedSize(landscape, 3);

    expect(clamped.scale).toBe(3);
    expect(clamped.offsetX).toBeCloseTo((content.width - AVATAR_VIEWPORT_SIZE) / 2);
    expect(clamped.offsetY).toBeCloseTo(-(content.height - AVATAR_VIEWPORT_SIZE) / 2);
  });

  it('falls back to scale 1 for non-finite input', () => {
    expect(clampCrop({ scale: Number.NaN, offsetX: 0, offsetY: 0 }, square).scale).toBe(1);
  });
});

describe('cropSourceRect', () => {
  it('takes the whole image when a square source exactly fills the viewport', () => {
    const rect = cropSourceRect({ scale: 1, offsetX: 0, offsetY: 0 }, square);

    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(1024);
    expect(rect.height).toBeCloseTo(1024);
  });

  it('centres the window on the image before any drag', () => {
    const rect = cropSourceRect({ scale: 1, offsetX: 0, offsetY: 0 }, landscape);

    expect(rect.x + rect.width / 2).toBeCloseTo(landscape.width / 2);
    expect(rect.y + rect.height / 2).toBeCloseTo(landscape.height / 2);
  });

  it('moves the source window opposite to the drag direction', () => {
    const before = cropSourceRect({ scale: 2, offsetX: 0, offsetY: 0 }, landscape);
    const draggedLeft = cropSourceRect({ scale: 2, offsetX: -50, offsetY: 0 }, landscape);

    expect(draggedLeft.x).toBeGreaterThan(before.x);
  });

  it('never returns a window outside the image, even when over-scaled and over-dragged', () => {
    const rect = cropSourceRect({ scale: 3, offsetX: 99999, offsetY: -99999 }, landscape);

    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(landscape.width + 0.001);
    expect(rect.y + rect.height).toBeLessThanOrEqual(landscape.height + 0.001);
    expect(rect.width).toBeLessThanOrEqual(landscape.width);
  });
});