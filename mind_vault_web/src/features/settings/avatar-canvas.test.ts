import { describe, expect, it, vi } from 'vitest';
import { AVATAR_OUTPUT_SIZE, AVATAR_VIEWPORT_SIZE, INITIAL_CROP_STATE, cropSourceRect } from './avatar';
import { canvasToBlob, decodeImage, drawCrop } from './avatar-canvas';

const landscape = { width: 1280, height: 720 };

function stubContext() {
  return { clearRect: vi.fn(), drawImage: vi.fn() };
}

function stubCanvas(context: ReturnType<typeof stubContext> | null) {
  return { getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
}

describe('drawCrop', () => {
  it('maps the visible viewport back to source pixels and scales it to the target', () => {
    const context = stubContext();
    const source = {} as CanvasImageSource;

    drawCrop(stubCanvas(context), source, landscape, INITIAL_CROP_STATE, AVATAR_OUTPUT_SIZE);

    // 横图铺满 320 视口时，可见区域是原图中央 720×720（x 起点 280）
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    const args = context.drawImage.mock.calls[0];
    expect(args[0]).toBe(source);
    expect(args[1]).toBeCloseTo(280, 4);
    expect(args[2]).toBeCloseTo(0, 4);
    expect(args[3]).toBeCloseTo(720, 4);
    expect(args[4]).toBeCloseTo(720, 4);
    expect(args.slice(5)).toEqual([0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE]);
  });

  it('agrees with cropSourceRect so preview and export never diverge', () => {
    const context = stubContext();
    const state = { scale: 2, offsetX: 40, offsetY: -30 };

    drawCrop(stubCanvas(context), {} as CanvasImageSource, landscape, state, AVATAR_VIEWPORT_SIZE);

    const expected = cropSourceRect(state, landscape, AVATAR_VIEWPORT_SIZE);
    const args = context.drawImage.mock.calls[0];
    expect(args[1]).toBe(expected.x);
    expect(args[2]).toBe(expected.y);
    expect(args[3]).toBe(expected.width);
    expect(args[4]).toBe(expected.height);
  });

  it('does nothing when the 2d context is unavailable', () => {
    expect(() =>
      drawCrop(stubCanvas(null), {} as CanvasImageSource, landscape, INITIAL_CROP_STATE, AVATAR_OUTPUT_SIZE),
    ).not.toThrow();
  });
});

describe('canvasToBlob', () => {
  it('keeps WebP when the browser can encode it', async () => {
    const webp = new Blob(['webp'], { type: 'image/webp' });
    const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
      if (type === 'image/webp') callback(webp);
    });

    await expect(canvasToBlob({ toBlob } as unknown as HTMLCanvasElement)).resolves.toBe(webp);
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9);
  });

  it('falls back to JPEG when WebP encoding returns null', async () => {
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
    const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
      callback(type === 'image/webp' ? null : jpeg);
    });

    await expect(canvasToBlob({ toBlob } as unknown as HTMLCanvasElement)).resolves.toBe(jpeg);
    expect(toBlob).toHaveBeenNthCalledWith(1, expect.any(Function), 'image/webp', 0.9);
    expect(toBlob).toHaveBeenNthCalledWith(2, expect.any(Function), 'image/jpeg', 0.9);
  });

  it('rejects when neither encoder produces a blob', async () => {
    const toBlob = vi.fn((callback: BlobCallback) => callback(null));

    await expect(canvasToBlob({ toBlob } as unknown as HTMLCanvasElement)).rejects.toThrow('图片编码失败');
  });
});

describe('decodeImage', () => {
  it('wraps createImageBitmap together with the bitmap size', async () => {
    const bitmap = { width: 640, height: 480 } as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));

    const decoded = await decodeImage(new Blob(['x']));

    expect(decoded.source).toBe(bitmap);
    expect(decoded.size).toEqual({ width: 640, height: 480 });
    vi.unstubAllGlobals();
  });
});