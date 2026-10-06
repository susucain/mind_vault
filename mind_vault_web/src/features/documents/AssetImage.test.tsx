import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDocumentAsset } from '../../api/documents';
import { AssetImage } from './AssetImage';

vi.mock('../../api/documents', () => ({ fetchDocumentAsset: vi.fn() }));

/** 立即判定为进入视口的 IntersectionObserver 替身，避免依赖真实布局。 */
class ImmediateObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

describe('AssetImage', () => {
  beforeEach(() => {
    vi.mocked(fetchDocumentAsset).mockReset();
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:asset'), writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
  });

  it('loads the asset through the authenticated API and renders an object URL', async () => {
    vi.mocked(fetchDocumentAsset).mockResolvedValue(new Blob(['x'], { type: 'image/png' }));

    render(<AssetImage alt="示意图" assetKey="pdf-images/a.png" />);

    await waitFor(() =>
      expect(screen.getByRole('img', { name: '示意图' })).toHaveAttribute('src', 'blob:asset'),
    );
    expect(fetchDocumentAsset).toHaveBeenCalledWith('pdf-images/a.png');
  });

  it('renders a placeholder without requesting when the reference is unresolvable', () => {
    render(<AssetImage alt="示意图" />);

    expect(screen.getByRole('img', { name: '示意图' })).toHaveTextContent('图片不可用');
    expect(fetchDocumentAsset).not.toHaveBeenCalled();
  });
});
