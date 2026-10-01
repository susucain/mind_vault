import { X } from 'lucide-react';
import { Drawer } from '../../components/ui';
import { DocumentPreviewPage } from '../../pages/library/DocumentPreviewPage';

export function DocumentPreview({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} side="right" title="原文预览">
      <div className="chat-preview"><DocumentPreviewPage /><button aria-label="关闭原文预览" className="icon-button chat-preview__close" onClick={() => onOpenChange(false)} type="button"><X size={16} /></button></div>
    </Drawer>
  );
}
