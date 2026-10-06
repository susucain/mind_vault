import { useEffect, useRef, useState } from 'react';
import { fetchDocumentAsset } from '../../api/documents';

interface AssetImageProps {
  /** 正文 `![](...)` 中的资产路径；缺省表示引用无法解析 */
  assetKey?: string;
  alt?: string;
}

/**
 * 文档正文资产的懒加载渲染。
 *
 * 资产端点需要 Bearer 令牌，而 `<img src>` 无法携带请求头，故进入视口后
 * 用 fetch 取回 Blob 再以 object URL 渲染；卸载时释放 URL 避免内存泄漏。
 */
export function AssetImage({ assetKey, alt }: AssetImageProps) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !assetKey) return;
    let objectUrl: string | undefined;
    let disposed = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void fetchDocumentAsset(assetKey)
          .then((blob) => {
            if (disposed) return;
            objectUrl = URL.createObjectURL(blob);
            setSrc(objectUrl);
          })
          .catch(() => {
            if (!disposed) setFailed(true);
          });
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);

    return () => {
      disposed = true;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetKey]);

  if (!assetKey || failed) {
    return (
      <span
        aria-label={alt || '图片不可用'}
        className="asset-image asset-image--missing"
        role="img"
      >
        图片不可用
      </span>
    );
  }

  return (
    <img
      alt={alt ?? ''}
      className="asset-image"
      data-loaded={src ? 'true' : undefined}
      decoding="async"
      loading="lazy"
      ref={ref}
      src={src}
    />
  );
}
