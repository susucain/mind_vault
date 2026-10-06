import { Button, Dialog } from '../../components/ui';

/**
 * 退出登录的二次确认。设置页「安全」分区与顶栏用户菜单共用同一份文案与行为，
 * 避免两处口径不一致（也与危险操作一律二次确认的约定一致）。
 */
export function LogoutDialog({
  onConfirm,
  onOpenChange,
  open,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open} title="退出登录">
      <p className="muted">将清除本机登录状态与缓存数据；已上传的知识库内容不受影响。</p>
      <div className="dialog-actions">
        <Button onClick={() => onOpenChange(false)} type="button" variant="secondary">取消</Button>
        <Button onClick={onConfirm} type="button">确认退出</Button>
      </div>
    </Dialog>
  );
}