import { lazy, Suspense } from 'react';
import { X } from 'lucide-react';
import { Drawer, LoadingState } from '../../components/ui';

/** 阅读页依赖 streamdown 与文档阅读组件，聊天侧按需加载，避免被打进主包。 */
const DocumentPreviewPage = lazy(() =>
  import('../../pages/library/DocumentPreviewPage').then((module) => ({ default: module.DocumentPreviewPage })),
);

export function DocumentPreview({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} side="right" title="原文预览">
      <div className="chat-preview">
        <Suspense fallback={<LoadingState label="加载原文" />}>
          <DocumentPreviewPage />
        </Suspense>
        <button aria-label="关闭原文预览" className="icon-button chat-preview__close" onClick={() => onOpenChange(false)} type="button"><X size={16} /></button>
      </div>
    </Drawer>
  );
}
